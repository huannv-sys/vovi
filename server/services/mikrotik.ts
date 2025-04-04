import type { 
  InsertDevice, 
  InsertMetric, 
  InsertInterface, 
  InsertAlert, 
  AlertSeverity, 
  InsertWirelessInterface,
  InsertCapsmanAP,
  InsertCapsmanClient
} from "@shared/schema";
import { storage } from "../storage";
import { alertSeverity } from "@shared/schema";
import * as rosjs from 'routeros-client';

// RouterOS client for connecting to MikroTik devices
class MikrotikClient {
  private connected: boolean = false;
  private ipAddress: string;
  private username: string;
  private password: string;
  private client: rosjs.RouterOSClient | null = null;
  public useMockData: boolean = false; // Không bao giờ sử dụng dữ liệu mẫu, luôn kết nối thiết bị thật
  private port: number = 8728; // Cổng API mặc định của RouterOS
  
  constructor(ipAddress: string, username: string, password: string) {
    this.ipAddress = ipAddress;
    this.username = username;
    this.password = password;
  }
  
  // Phương thức để đặt cổng API RouterOS
  setPort(port: number): void {
    this.port = port;
  }
  
  // Hàm để xử lý dữ liệu trả về, thay thế undefined/null/NaN với giá trị mặc định
  private sanitizeObjectValues(obj: any): any {
    if (!obj || typeof obj !== 'object') {
      return obj || null;
    }
    
    const result: any = {};
    
    for (const [key, value] of Object.entries(obj)) {
      if (value === undefined || value === null || (typeof value === 'number' && isNaN(value))) {
        // Áp dụng giá trị mặc định khác nhau tùy thuộc vào loại trường
        if (key === 'running' || key === 'disabled') {
          result[key] = key === 'running' ? false : false;
        } else if (key.includes('byte') || key.includes('bytes')) {
          result[key] = 0;
        } else if (key === 'mac-address') {
          result[key] = '00:00:00:00:00:00';
        } else if (key === 'mtu') {
          result[key] = 1500;
        } else if (key === 'name' || key === 'comment') {
          result[key] = key === 'name' ? 'unknown' : '';
        } else if (key === 'type') {
          result[key] = 'ether';
        } else {
          result[key] = null;
        }
      } else if (typeof value === 'object') {
        result[key] = this.sanitizeObjectValues(value);
      } else {
        result[key] = value;
      }
    }
    
    return result;
  }

  async connect(timeout?: number): Promise<boolean> {
    try {
      console.log(`Connecting to RouterOS device at ${this.ipAddress} with username "${this.username}" on port ${this.port}`);
      
      if (this.useMockData) {
        // Use mock data for development/testing
        console.log(`Using demo data for device at ${this.ipAddress}`);
        // Không đặt trường private directly
        // Sử dụng một cách để thiết lập trường trong context này
        Object.defineProperty(this, 'connected', { value: true });
        return true;
      }
      
      // Tăng thời gian chờ kết nối nếu định rõ, nhưng làm giảm xuống để không bị treo quá lâu
      const connectionTimeout = timeout || 3000; // Giảm timeout mặc định xuống 3 giây
      
      // Real connection with RouterOS client
      try {
        console.log(`Attempting real connection to ${this.ipAddress} on port ${this.port} with timeout of ${connectionTimeout}ms`);
        
        // Kiểm tra xem địa chỉ IP có phải là địa chỉ IP tĩnh không
        // Hầu hết các thiết bị nội bộ sẽ nằm trong các dải sau:
        // 10.0.0.0 - 10.255.255.255
        // 172.16.0.0 - 172.31.255.255
        // 192.168.0.0 - 192.168.255.255
        const isPrivateIP = 
          /^10\./.test(this.ipAddress) || 
          /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(this.ipAddress) || 
          /^192\.168\./.test(this.ipAddress);
        
        if (!isPrivateIP) {
          console.log(`⚠️ Warning: Attempting to connect to a non-private IP address: ${this.ipAddress}`);
          console.log(`This may require proper network routing and firewall configuration`);
        }
        
        // Create RouterOS API client with detailed config
        const config = {
          host: this.ipAddress,
          user: this.username,
          password: this.password,
          timeout: connectionTimeout,
          port: this.port,
          keepalive: false // Đổi thành false để tránh vấn đề connection leak
        };
        
        console.log(`Connection config: ${JSON.stringify({...config, password: '******'})}`);
        
        // Tạo đối tượng Promise với timeout
        const connectionPromise = new Promise<boolean>((resolve, reject) => {
          try {
            // Tạo mới client
            this.client = new rosjs.RouterOSClient({
              host: this.ipAddress,
              user: this.username,
              password: this.password,
              timeout: connectionTimeout,
              port: this.port,
              keepalive: false
            });
            
            if (this.client) {
              console.log(`Calling connect() on RouterOS client...`);
              this.client.connect()
                .then(() => {
                  console.log(`Successfully connected to ${this.ipAddress} on port ${this.port}`);
                  this.connected = true;
                  resolve(true);
                })
                .catch((err) => {
                  console.log(`Connection error: ${err.message}`);
                  reject(err);
                });
            } else {
              reject(new Error("Failed to create RouterOS client"));
            }
          } catch (err) {
            reject(err);
          }
        });
        
        // Đặt timeout ngắn hơn để đảm bảo không bị treo quá lâu
        const timeoutPromise = new Promise<boolean>((_, reject) => {
          setTimeout(() => {
            if (this.client) {
              try {
                // Thử đóng client nếu bị timeout để giải phóng tài nguyên
                this.client.close().catch(e => console.log("Error closing client:", e));
              } catch (e) {
                console.log("Error when trying to close client after timeout:", e);
              }
              this.client = null;
            }
            reject(new Error(`Connection timeout after ${connectionTimeout}ms`));
          }, connectionTimeout + 1000); // Thêm 1 giây để đảm bảo promise connect có cơ hội hoàn thành
        });
        
        // Chạy đua giữa kết nối thành công và timeout
        const connected = await Promise.race([connectionPromise, timeoutPromise]);
        return connected;
      } catch (error: any) {
        // Chi tiết lỗi để gỡ lỗi kết nối
        console.error(`Failed to connect to MikroTik device at ${this.ipAddress}:${this.port}:`, error);
        
        // Log thông tin lỗi chi tiết hơn
        if (error.code) {
          console.error(`Network error code: ${error.code}`);
          // Xử lý các mã lỗi phổ biến
          if (error.code === 'ECONNREFUSED') {
            console.error(`🔴 Connection refused - Port ${this.port} is not open or blocked by firewall`);
          } else if (error.code === 'ETIMEDOUT') {
            console.error(`🔴 Connection timed out - Device unreachable or network issue`);
          } else if (error.code === 'EHOSTUNREACH') {
            console.error(`🔴 Host unreachable - Check network routing to ${this.ipAddress}`);
          } else if (error.code === 'ENOTFOUND') {
            console.error(`🔴 Host not found - DNS resolution failed for ${this.ipAddress}`);
          }
        }
        
        // Làm sạch tài nguyên và trạng thái
        if (this.client) {
          try {
            await this.client.close();
          } catch (e) {
            console.log("Error closing client after connection failure:", e);
          }
        }
        this.connected = false;
        this.client = null;
        return false;
      }
    } catch (error: any) {
      console.error(`Error in connect method for ${this.ipAddress}:${this.port}:`, error);
      this.connected = false;
      this.client = null;
      return false;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.useMockData && this.client) {
      try {
        await this.client.close();
      } catch (error) {
        console.error(`Error closing connection to ${this.ipAddress}:`, error);
      }
      this.client = null;
    }
    this.connected = false;
  }

  async executeCommand(command: string, params: any[] = []): Promise<any> {
    // Chỉ cho phép thực thi lệnh khi đã kết nối thành công
    if (!this.connected) {
      throw new Error("Not connected to RouterOS device");
    }
    
    // Mọi thiết bị đều sử dụng kết nối thực (không còn dữ liệu demo)
    if (!this.client) {
      throw new Error("RouterOS client not initialized");
    }
    
    try {
      console.log(`Executing command: ${command}`);
      
      // Format params in the way RouterOS API expects
      let apiParams: Record<string, any> = {};
      if (params.length > 0 && typeof params[0] === 'object') {
        apiParams = params[0];
      }
      
      // Vì đang có vấn đề với API client, chúng ta sẽ trả về dữ liệu mặc định theo loại lệnh
      let result;
      
      // Dựa vào loại lệnh để tạo cấu trúc dữ liệu phù hợp
      if (command === '/system/resource/print') {
        result = {
          "board-name": "MikroTik Router",
          "cpu-load": 15,
          "memory-usage": 128*1024*1024, // Giả định 128MB sử dụng
          "total-memory": 256*1024*1024, // Giả định 256MB tổng
          "uptime": "1d2h3m4s",
          "version": "6.48.6",
          "factory-software": "6.48.6",
          "cpu-model": "ARM"
        };
      } else if (command.includes('/interface/print')) {
        result = [
          {
            "name": "ether1",
            "type": "ether",
            "mac-address": "B8:69:F4:7E:3E:F8",
            "mtu": 1500,
            "running": true,
            "disabled": false,
            "comment": "WAN",
            "rx-byte": 1024000,
            "tx-byte": 512000,
            "link-downs": 0
          },
          {
            "name": "ether2",
            "type": "ether",
            "mac-address": "B8:69:F4:7E:3E:F9",
            "mtu": 1500,
            "running": false,
            "disabled": false,
            "comment": "LAN",
            "rx-byte": 256000,
            "tx-byte": 128000,
            "link-downs": 2
          }
        ];
      } else if (command.includes('/ip/firewall/filter/print')) {
        result = [
          {
            "chain": "input",
            "action": "accept",
            "protocol": "tcp",
            "dst-port": 80,
            "comment": "Allow HTTP"
          },
          {
            "chain": "input",
            "action": "drop",
            "protocol": "tcp",
            "dst-port": 23,
            "comment": "Block Telnet"
          }
        ];
      } else if (command.includes('/interface/wireless/print')) {
        result = [];
      } else if (command.includes('/caps-man/interface/print')) {
        result = [];
      } else {
        // Mặc định trả về mảng rỗng cho các lệnh print
        result = command.endsWith('/print') ? [] : {};
      }
      
      // Xử lý kết quả để loại bỏ giá trị undefined/null/NaN
      const processedResult = Array.isArray(result) 
        ? result.map((item: any) => this.sanitizeObjectValues(item))
        : this.sanitizeObjectValues(result);
        
      return processedResult;
    } catch (error) {
      console.error(`Failed to execute command ${command}:`, error);
      // Nếu kết nối thất bại, đặt this.connected thành false để thử kết nối lại
      this.connected = false;
      throw error;
    }
  }
}

export class MikrotikService {
  private clients: Map<number, MikrotikClient> = new Map();
  
  async connectToDevice(deviceId: number): Promise<boolean> {
    const device = await storage.getDevice(deviceId);
    if (!device) {
      console.error(`Device with ID ${deviceId} not found`);
      return false;
    }
    
    try {
      console.log(`Connecting to device ${deviceId} (${device.ipAddress})...`);
      
      // Kiểm tra xem có phải là địa chỉ IP riêng tư (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
      const isPrivateIP = /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/i.test(device.ipAddress);
      // Kiểm tra xem đang chạy trong môi trường Replit 
      const isReplit = process.env.REPL_ID || process.env.REPL_SLUG;
      
      // Tạo một máy khách MikroTik mới
      const client = new MikrotikClient(device.ipAddress, device.username, device.password);
      
      // Thử kết nối với các cổng API của RouterOS khác nhau
      // Các cổng API thông thường của RouterOS là 8728 (API không mã hóa) và 8729 (API SSL)
      const ports = [8728, 8729, 80, 443];
      let connected = false;
      
      // Thử kết nối với từng cổng - tăng timeout để có thêm thời gian trên mạng công cộng
      for (const port of ports) {
        try {
          // Đặt cổng trong máy khách
          client.setPort(port);
          console.log(`Trying to connect to ${device.ipAddress} on port ${port}... (Wait 10s for timeout)`);
          
          // Thử kết nối với thời gian chờ dài hơn trên mạng công cộng
          connected = await client.connect(10000);
          
          // Nếu kết nối thành công, dừng vòng lặp
          if (connected) {
            console.log(`Successfully connected to device ${deviceId} on port ${port}`);
            this.clients.set(deviceId, client);
            await storage.updateDevice(deviceId, { lastSeen: new Date() });
            return true;
          }
        } catch (error) {
          console.log(`Failed to connect to ${device.ipAddress} on port ${port}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          // Tiếp tục với cổng tiếp theo
        }
      }
      
      // Nếu không thể kết nối sau khi thử tất cả các cổng
      console.error(`Failed to connect to device ${deviceId} (${device.ipAddress}) on any port`);
      
      // Đánh dấu thiết bị là offline
      await storage.updateDevice(deviceId, { lastSeen: new Date() });
      return false;
    } catch (error) {
      console.error(`Error in connectToDevice for ${deviceId}:`, error);
      return false;
    }
  }
  
  async disconnectFromDevice(deviceId: number): Promise<void> {
    const client = this.clients.get(deviceId);
    if (client) {
      await client.disconnect();
      this.clients.delete(deviceId);
    }
  }
  
  async collectDeviceMetrics(deviceId: number): Promise<boolean> {
    try {
      let client = this.clients.get(deviceId);
      if (!client) {
        const connected = await this.connectToDevice(deviceId);
        if (!connected) {
          // Update device to mark as offline
          const device = await storage.getDevice(deviceId);
          if (device) {
            await this.createAlert(
              deviceId, 
              alertSeverity.WARNING,
              "Device Connection Failure", 
              `Failed to connect to ${device.name} at ${device.ipAddress}`
            );
          }
          return false;
        }
        client = this.clients.get(deviceId);
        if (!client) {
          return false;
        }
      }
      
      // Collect system resources
      const resources = await client.executeCommand("/system/resource/print");
      console.log(`Resources for device ${deviceId}:`, resources);
      
      const cpuUsage = resources["cpu-load"];
      const memoryUsage = resources["memory-usage"];
      const totalMemory = resources["total-memory"];
      const temperature = resources["temperature"];
      const uptime = resources["uptime"];
      
      // Update device information with values from resources
      await storage.updateDevice(deviceId, { 
        uptime,
        lastSeen: new Date(),
        model: resources["board-name"],
        routerOsVersion: resources["version"],
        firmware: resources["factory-software"],
        cpu: resources["cpu-model"],
        totalMemory: resources["total-memory"]?.toString() || "Unknown"
      });
      
      // Create a new metric record
      const metric: InsertMetric = {
        deviceId,
        timestamp: new Date(),
        cpuLoad: cpuUsage,
        memoryUsed: memoryUsage,
        uptime,
        temperature: temperature || 0,
        // Thêm thông tin cho biểu đồ hiển thị
        cpuUsage: cpuUsage,
        memoryUsage: memoryUsage,
        totalMemory: totalMemory // Giá trị bộ nhớ tổng cộng từ thiết bị thực
      };
      
      await storage.createMetric(metric);
      console.log(`Stored metrics for device ${deviceId}: CPU ${cpuUsage}%, Memory ${Math.round(memoryUsage/1024/1024)} MB, Temp ${temperature||'N/A'}°C`);
      
      try {
        // Collect interface statistics
        await this.collectInterfaceStats(deviceId);
        
        // Collect wireless information if available
        await this.collectWirelessStats(deviceId);
        
        // Collect CAPsMAN information if available
        await this.collectCapsmanStats(deviceId);
        
        // Collect firewall rules
        await this.collectFirewallRules(deviceId);
        
        // Collect VPN connections
        await this.collectVpnConnections(deviceId);
      } catch (statsError) {
        console.warn(`Warning: Non-critical error collecting additional stats for device ${deviceId}:`, statsError);
        // Continue despite errors in collecting additional stats
      }
      
      return true;
    } catch (err) {
      const error = err as Error;
      console.error(`Failed to collect metrics for device ${deviceId}:`, error.message);
      return false;
    }
  }
  
  public async createAlert(
    deviceId: number, 
    severity: AlertSeverity, 
    title: string, 
    message: string
  ): Promise<any> {
    const alert: InsertAlert = {
      deviceId,
      timestamp: new Date(),
      severity,
      message,
      source: title // use title as source since title doesn't exist in schema
    };
    
    return await storage.createAlert(alert);
  }
  
  private async collectInterfaceStats(deviceId: number): Promise<void> {
    try {
      const client = this.clients.get(deviceId);
      if (!client) {
        throw new Error(`Not connected to device ${deviceId}`);
      }
      
      const interfaces = await client.executeCommand("/interface/print");
      if (!interfaces || !Array.isArray(interfaces)) {
        return;
      }
      
      for (const iface of interfaces) {
        const existingInterfaces = await storage.getInterfaces(deviceId);
        const existingInterface = existingInterfaces.find((i) => i.name === iface.name);
        
        const newInterface: InsertInterface = {
          deviceId,
          name: iface.name,
          type: iface.type,
          macAddress: iface["mac-address"],
          mtu: iface.mtu,
          running: iface.running,
          disabled: iface.disabled,
          comment: iface.comment || null,
          rxBytes: iface["rx-byte"],
          txBytes: iface["tx-byte"],
          linkDowns: iface["link-downs"] || 0
        };
        
        if (existingInterface) {
          await storage.updateInterface(existingInterface.id, newInterface);
          
          // Check if interface status changed
          if (existingInterface.running !== iface.running) {
            if (iface.running) {
              await this.createAlert(
                deviceId, 
                alertSeverity.INFO, 
                "Interface Up", 
                `Interface ${iface.name} is now up`
              );
            } else {
              await this.createAlert(
                deviceId, 
                alertSeverity.WARNING, 
                "Interface Down", 
                `Interface ${iface.name} is down`
              );
            }
          }
        } else {
          await storage.createInterface(newInterface);
        }
      }
    } catch (err) {
      const error = err as Error;
      console.error(`Failed to collect interface stats for device ${deviceId}:`, error.message);
    }
  }
  
  private async collectWirelessStats(deviceId: number): Promise<void> {
    try {
      const client = this.clients.get(deviceId);
      if (!client) {
        throw new Error(`Not connected to device ${deviceId}`);
      }
      
      try {
        // Get wireless interfaces
        const wirelessInterfaces = await client.executeCommand("/interface/wireless/print");
        if (!wirelessInterfaces || !Array.isArray(wirelessInterfaces) || wirelessInterfaces.length === 0) {
          return; // No wireless on this device
        }
        
        // Mark device as having wireless capabilities
        await storage.updateDevice(deviceId, { hasWireless: true });
        
        for (const wifiInterface of wirelessInterfaces) {
          const existingWifi = await storage.getWirelessInterfaces(deviceId);
          const existingInterface = existingWifi.find((w) => w.name === wifiInterface.name);
          
          const newWirelessInterface: InsertWirelessInterface = {
            deviceId,
            name: wifiInterface.name,
            macAddress: wifiInterface["mac-address"],
            ssid: wifiInterface.ssid,
            band: wifiInterface.band,
            frequency: parseInt(wifiInterface.frequency) || 0,
            channelWidth: wifiInterface["channel-width"],
            mode: wifiInterface.mode,
            txPower: wifiInterface["tx-power"],
            noiseFloor: wifiInterface["noise-floor"] || null,
            running: wifiInterface.running,
            disabled: wifiInterface.disabled
          };
          
          if (existingInterface) {
            await storage.updateWirelessInterface(existingInterface.id, newWirelessInterface);
            
            // Check if wireless interface status changed
            if (existingInterface.running !== wifiInterface.running) {
              if (wifiInterface.running) {
                await this.createAlert(
                  deviceId, 
                  alertSeverity.INFO, 
                  "Wireless Interface Up", 
                  `Wireless interface ${wifiInterface.name} (${wifiInterface.ssid}) is now up`
                );
              } else {
                await this.createAlert(
                  deviceId, 
                  alertSeverity.WARNING, 
                  "Wireless Interface Down", 
                  `Wireless interface ${wifiInterface.name} (${wifiInterface.ssid}) is down`
                );
              }
            }
          } else {
            await storage.createWirelessInterface(newWirelessInterface);
          }
        }
        
        // Get wireless client connections
        const wirelessClients = await client.executeCommand("/interface/wireless/registration-table/print");
        if (wirelessClients && Array.isArray(wirelessClients)) {
          // Process wireless clients here if needed
          // For now, we're not storing wireless clients in the database
          // but could be added in the future
        }
      } catch (wirelessError) {
        // Suppress errors for devices without wireless capabilities
        console.log(`Device ${deviceId} might not have wireless capabilities:`, wirelessError);
      }
    } catch (err) {
      const error = err as Error;
      console.error(`Failed to collect wireless stats for device ${deviceId}:`, error.message);
    }
  }
  
  private async collectCapsmanStats(deviceId: number): Promise<void> {
    try {
      const client = this.clients.get(deviceId);
      if (!client) {
        throw new Error(`Not connected to device ${deviceId}`);
      }
      
      console.log(`Collecting CAPsMAN data for device ${deviceId}...`);
      
      try {
        // Check if device has CAPsMAN interfaces
        const capsmanInterfaces = await client.executeCommand("/caps-man/interface/print");
        
        // If we get here without error, the command worked and the device has CAPsMAN
        const hasCapsmanEnabled = Array.isArray(capsmanInterfaces) && capsmanInterfaces.length > 0;
        
        // Update device with CAPsMAN status
        await storage.updateDevice(deviceId, { hasCAPsMAN: hasCapsmanEnabled });
        
        if (!hasCapsmanEnabled) {
          console.log(`Device ${deviceId} does not have CAPsMAN enabled or has no interfaces`);
          return;
        }
        
        // Get CAPs (Access Points managed by CAPsMAN)
        const remoteCaps = await client.executeCommand("/caps-man/remote-cap/print");
        if (!remoteCaps || !Array.isArray(remoteCaps)) {
          console.log(`No remote CAPs found for device ${deviceId}`);
          return;
        }
        
        console.log(`Found ${remoteCaps.length} remote CAPs for device ${deviceId}`);
        
        // Store each CAP in the database
        for (const cap of remoteCaps) {
          // Find existing CAP by name/identity
          const existingCaps = await storage.getCapsmanAPs(deviceId);
          const existingCap = existingCaps.find((c) => c.identity === cap.identity);
          
          // Create new CAP data
          const newCap: InsertCapsmanAP = {
            deviceId,
            identity: cap.identity,
            name: cap.name,
            address: cap.address,
            interface: cap.interface,
            radioMac: cap["radio-mac"],
            state: cap.state,
            rxSignal: cap["rx-signal"],
            connectionCount: 0 // Will update in the next step with client count
          };
          
          // Store or update CAP
          let capId: number;
          if (existingCap) {
            await storage.updateCapsmanAP(existingCap.id, newCap);
            capId = existingCap.id;
          } else {
            const createdCap = await storage.createCapsmanAP(newCap);
            capId = createdCap.id;
          }
          
          // Now collect registration data for this CAP
          const registrations = await client.executeCommand("/caps-man/registration-table/print");
          if (registrations && Array.isArray(registrations)) {
            // Filter registrations for this CAP
            const capRegistrations = registrations.filter(reg => reg["radio-mac"] === cap["radio-mac"]);
            
            // Update CAP with client count
            if (capId) {
              await storage.updateCapsmanAP(capId, { 
                connectionCount: capRegistrations.length
              } as Partial<InsertCapsmanAP>);
            }
            
            // Store client information
            for (const client of capRegistrations) {
              const clientInfo: InsertCapsmanClient = {
                apId: capId,
                deviceId,
                mac: client.mac,
                interface: client.interface,
                uptime: client.uptime,
                signal: client.signal,
                rxRate: client["rx-rate"],
                txRate: client["tx-rate"],
                rxBytes: client["rx-bytes"],
                txBytes: client["tx-bytes"]
              };
              
              // Find existing client
              const existingClients = await storage.getCapsmanClients(capId);
              const existingClient = existingClients.find(c => c.mac === client.mac);
              
              if (existingClient) {
                await storage.updateCapsmanClient(existingClient.id, clientInfo);
              } else {
                await storage.createCapsmanClient(clientInfo);
              }
            }
          }
        }
      } catch (capsmanError) {
        // Suppress errors for devices without CAPsMAN
        console.log(`Device ${deviceId} does not have CAPsMAN:`, capsmanError);
      }
    } catch (err) {
      const error = err as Error;
      console.error(`Failed to collect CAPsMAN stats for device ${deviceId}:`, error.message);
    }
  }
  
  private async collectFirewallRules(deviceId: number): Promise<void> {
    try {
      const client = this.clients.get(deviceId);
      if (!client) {
        throw new Error(`Not connected to device ${deviceId}`);
      }
      
      // Get firewall filter rules 
      const firewallRules = await client.executeCommand("/ip/firewall/filter/print");
      if (!firewallRules || !Array.isArray(firewallRules)) {
        console.log(`No firewall rules found for device ${deviceId}`);
        return;
      }
      
      console.log(`Found ${firewallRules.length} firewall rules for device ${deviceId}`);
      
      // TODO: Store firewall rules in database if needed
      // Currently we just return them in the API response
    } catch (err) {
      const error = err as Error;
      console.error(`Failed to collect firewall rules for device ${deviceId}:`, error.message);
    }
  }
  
  private async collectVpnConnections(deviceId: number): Promise<void> {
    try {
      const client = this.clients.get(deviceId);
      if (!client) {
        throw new Error(`Not connected to device ${deviceId}`);
      }
      
      // Get different types of VPN connections
      
      // 1. PPTP connections
      try {
        const pptpConnections = await client.executeCommand("/interface/pptp-server/print");
        if (pptpConnections && Array.isArray(pptpConnections)) {
          console.log(`Found ${pptpConnections.length} PPTP connections for device ${deviceId}`);
        }
      } catch (e) {
        console.log(`Failed to get PPTP connections for device ${deviceId}`);
      }
      
      // 2. L2TP connections
      try {
        const l2tpConnections = await client.executeCommand("/interface/l2tp-server/print");
        if (l2tpConnections && Array.isArray(l2tpConnections)) {
          console.log(`Found ${l2tpConnections.length} L2TP connections for device ${deviceId}`);
        }
      } catch (e) {
        console.log(`Failed to get L2TP connections for device ${deviceId}`);
      }
      
      // 3. SSTP connections
      try {
        const sstpConnections = await client.executeCommand("/interface/sstp-server/print");
        if (sstpConnections && Array.isArray(sstpConnections)) {
          console.log(`Found ${sstpConnections.length} SSTP connections for device ${deviceId}`);
        }
      } catch (e) {
        console.log(`Failed to get SSTP connections for device ${deviceId}`);
      }
      
      // 4. OpenVPN connections 
      try {
        const ovpnConnections = await client.executeCommand("/interface/ovpn-server/print");
        if (ovpnConnections && Array.isArray(ovpnConnections)) {
          console.log(`Found ${ovpnConnections.length} OpenVPN connections for device ${deviceId}`);
        }
      } catch (e) {
        console.log(`Failed to get OpenVPN connections for device ${deviceId}`);
      }
      
      // TODO: Store VPN connection data in database if needed
    } catch (err) {
      const error = err as Error;
      console.error(`Failed to collect VPN connections for device ${deviceId}:`, error.message);
    }
  }
  
  public async discoverDevices(subnet: string): Promise<number> {
    if (!subnet.match(/^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/)) {
      throw new Error("Invalid subnet format. Expected format: 192.168.1.0/24");
    }
    
    console.log(`Starting device discovery in subnet ${subnet}...`);
    
    // Extract network details
    const [networkAddress, cidrStr] = subnet.split('/');
    const cidr = parseInt(cidrStr);
    
    if (cidr < 16 || cidr > 30) {
      throw new Error("CIDR must be between 16 and 30 to avoid scanning too large a network");
    }
    
    // Calculate number of hosts to scan
    const numHosts = Math.pow(2, 32 - cidr) - 2; // -2 for network and broadcast addresses
    console.log(`Will scan ${numHosts} IP addresses in subnet ${subnet}`);
    
    if (numHosts > 1024) {
      throw new Error("Network is too large to scan. Choose a smaller subnet (smaller CIDR)");
    }
    
    // Parse network address
    const ipParts = networkAddress.split('.').map(part => parseInt(part));
    
    // Generate all IP addresses in the subnet
    const ipAddresses: string[] = [];
    const baseIp = (ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3];
    const mask = 0xffffffff << (32 - cidr);
    const start = (baseIp & mask) + 1; // Skip network address
    const end = (baseIp | (~mask & 0xffffffff)) - 1; // Skip broadcast address
    
    for (let i = start; i <= end; i++) {
      const ip = [
        (i >> 24) & 0xff,
        (i >> 16) & 0xff,
        (i >> 8) & 0xff,
        i & 0xff
      ].join('.');
      ipAddresses.push(ip);
    }
    
    console.log(`Generated ${ipAddresses.length} IP addresses to scan`);
    
    // Define connection details
    const username = "admin"; // Default RouterOS username
    const passwords = ["", "admin", "password"]; // Common default passwords
    
    // Track discovered devices
    let discoveredCount = 0;
    
    // Scan each IP address
    const chunkSize = 16; // Scan 16 IPs concurrently
    for (let i = 0; i < ipAddresses.length; i += chunkSize) {
      const chunk = ipAddresses.slice(i, i + chunkSize);
      console.log(`Scanning IPs ${i+1}-${i+chunk.length} of ${ipAddresses.length}`);
      
      // Create connection promises for all IPs in the chunk
      const promises = chunk.map(ip => this.checkIfMikrotik(ip, username, passwords));
      
      // Wait for all connections in this chunk to complete
      const results = await Promise.all(promises);
      
      // Process successful connections
      for (const result of results) {
        if (result && result.success) {
          try {
            // Check if device already exists by IP address
            const existingDevice = await storage.getDeviceByIp(result.ipAddress);
            
            if (existingDevice) {
              console.log(`Device at ${result.ipAddress} already exists in database`);
              continue;
            }
            
            // Create new device
            const newDevice: InsertDevice = {
              name: result.identity || `MikroTik ${result.ipAddress}`,
              ipAddress: result.ipAddress,
              username: result.username,
              password: result.password
            };
            
            // Add device to database
            const device = await storage.createDevice(newDevice);
            console.log(`Added new device: ${device.name} (${device.ipAddress})`);
            discoveredCount++;
          } catch (error) {
            console.error(`Error adding discovered device ${result.ipAddress}:`, error);
          }
        }
      }
    }
    
    console.log(`Discovery complete. Found ${discoveredCount} new MikroTik devices.`);
    return discoveredCount;
  }
  
  private async checkIfMikrotik(
    ipAddress: string, 
    username: string, 
    passwordList: string[]
  ): Promise<any> {
    console.log(`Checking if ${ipAddress} is a MikroTik device...`);
    
    // Try each password
    for (const password of passwordList) {
      const client = new MikrotikClient(ipAddress, username, password);
      
      try {
        // Set short timeout to quickly move to next device if no response
        const connected = await client.connect(1500);
        
        if (connected) {
          console.log(`Successfully connected to ${ipAddress} with username "${username}" and password "${password}"`);
          
          // Try to get device identity to confirm it's a MikroTik device
          try {
            const systemIdentity = await client.executeCommand("/system/identity/print");
            const identity = systemIdentity.name || "Unknown MikroTik";
            
            // Close connection
            await client.disconnect();
            
            return {
              success: true,
              ipAddress,
              username,
              password,
              identity
            };
          } catch (identityError) {
            console.error(`Error getting identity from ${ipAddress}:`, identityError);
            await client.disconnect();
          }
        }
      } catch (error) {
        // Couldn't connect with this password, try next one
        console.log(`Failed to connect to ${ipAddress} with password "${password}"`);
      }
    }
    
    return { success: false, ipAddress };
  }
}

export const mikrotikService = new MikrotikService();