import type { 
  InsertDevice, 
  InsertMetric, 
  InsertInterface, 
  InsertAlert, 
  AlertSeverity, 
  Device
} from "@shared/schema";
import { storage } from "../storage";
import { alertSeverity } from "@shared/schema";
import { wirelessService } from "./wireless";
import { capsmanService } from "./capsman";
import { deviceInfoService } from "./device_info";

// Sử dụng thư viện node-routeros để kết nối với RouterOS
import * as RouterOS from 'node-routeros';

/**
 * Interface định nghĩa tham số kết nối
 */
interface ConnectionParams {
  id: number;
  host: string;
  username: string;
  password: string;
  port?: number;
}

/**
 * Lưu trữ các kết nối MikroTik đang hoạt động
 */
interface ConnectionStore {
  [key: number]: MikrotikClient;
}

/**
 * MikroTik Client Class - Quản lý kết nối tới thiết bị MikroTik
 */
class MikrotikClient {
  private connected: boolean = false;
  private ipAddress: string;
  private username: string;
  private password: string;
  private connection: any = null;
  private port: number = 8728; // Cổng API mặc định

  constructor(ipAddress: string, username: string, password: string) {
    this.ipAddress = ipAddress;
    this.username = username;
    this.password = password;
  }
  
  setPort(port: number): void {
    this.port = port;
  }
  
  // Xử lý dữ liệu để tránh undefined/null/NaN
  private sanitizeObjectValues(obj: any): any {
    if (!obj || typeof obj !== 'object') {
      return obj || null;
    }
    
    const result: any = {};
    
    for (const [key, value] of Object.entries(obj)) {
      if (value === undefined || value === null || (typeof value === 'number' && isNaN(value))) {
        if (key === 'running' || key === 'disabled') {
          result[key] = false;
        } else if (key.includes('byte') || key.includes('packets')) {
          result[key] = 0;
        } else if (key === 'mac-address') {
          result[key] = '00:00:00:00:00:00';
        } else if (key === 'name' || key === 'comment') {
          result[key] = key === 'name' ? 'unknown' : '';
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

  async connect(timeout = 20000): Promise<boolean> {
    try {
      if (this.connected && this.connection) {
        console.log(`Already connected to ${this.ipAddress}`);
        return true;
      }
      
      console.log(`Connecting to ${this.ipAddress}:${this.port} as ${this.username}`);
      
      const connectionConfig = {
        host: this.ipAddress,
        user: this.username,
        password: this.password,
        port: this.port,
        timeout: timeout,
        keepalive: true
      };
      
      console.log(`Connection config: ${JSON.stringify({...connectionConfig, password: '******'})}`);
      
      // Tạo kết nối mới
      this.connection = new RouterOS.RouterOSAPI(connectionConfig);
      
      try {
        // Thiết lập timeout cho kết nối với thời gian dài hơn (20 giây)
        const connectPromise = this.connection.connect();
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Connection timed out after ${timeout}ms`));
          }, timeout);
        });
        
        await Promise.race([connectPromise, timeoutPromise]);
        
        console.log(`Successfully connected to ${this.ipAddress}`);
        this.connected = true;
        
        // Thiết lập sự kiện để theo dõi khi kết nối bị đóng một cách không mong muốn
        if (this.connection && this.connection.socket) {
          this.connection.socket.on('close', () => {
            console.log(`Connection to ${this.ipAddress} was closed unexpectedly`);
            this.connected = false;
          });
        }
        
        return true;
      } catch (error) {
        console.error(`Failed to connect to ${this.ipAddress}:`, error);
        this.connected = false;
        this.connection = null;
        return false;
      }
    } catch (error) {
      console.error(`Error in connect method for ${this.ipAddress}:`, error);
      this.connected = false;
      this.connection = null;
      return false;
    }
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      try {
        this.connection.close();
        console.log(`Disconnected from ${this.ipAddress}`);
      } catch (error) {
        console.error(`Error disconnecting from ${this.ipAddress}:`, error);
      }
      this.connection = null;
    }
    this.connected = false;
  }

  async executeCommand(command: string, params: any[] = []): Promise<any> {
    if (!this.connected || !this.connection) {
      throw new Error(`Not connected to RouterOS device ${this.ipAddress}`);
    }
    
    try {
      console.log(`Executing command: ${command}`);
      
      // Chuẩn bị command và params
      const fullCommand = command.startsWith('/') ? command : `/${command}`;
      
      // Chuyển đổi params sang định dạng RouterOS API
      let apiParams: any = {};
      if (params && params.length > 0) {
        if (typeof params[0] === 'object') {
          apiParams = params[0];
        }
      }
      
      // Thực thi lệnh
      const result = await this.connection.write(fullCommand, apiParams);
      
      // Xử lý kết quả để tránh undefined/null/NaN
      const processedResult = Array.isArray(result) 
        ? result.map((item: any) => this.sanitizeObjectValues(item))
        : this.sanitizeObjectValues(result);
      
      return processedResult;
    } catch (error) {
      console.error(`Failed to execute command ${command}:`, error);
      throw error;
    }
  }
}

export class MikrotikService {
  private clients: Map<number, MikrotikClient> = new Map();
  
  /**
   * Lấy client kết nối tới thiết bị MikroTik theo ID
   */
  getClientForDevice(deviceId: number): MikrotikClient | undefined {
    return this.clients.get(deviceId);
  }
  
  /**
   * Kết nối đến thiết bị MikroTik sử dụng tham số kết nối
   * @param params Tham số kết nối
   * @returns Thành công hay không
   */
  async connect(params: ConnectionParams): Promise<boolean> {
    try {
      // Kiểm tra xem đã có kết nối chưa
      let client = this.clients.get(params.id);
      
      // Nếu đã có kết nối, ngắt kết nối cũ
      if (client) {
        await client.disconnect();
        this.clients.delete(params.id);
      }
      
      // Tạo client mới
      client = new MikrotikClient(params.host, params.username, params.password);
      
      // Thiết lập cổng nếu có
      if (params.port) {
        client.setPort(params.port);
      }
      
      // Kết nối
      const connected = await client.connect();
      
      if (connected) {
        this.clients.set(params.id, client);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error(`Error connecting to device ${params.id}:`, error);
      return false;
    }
  }
  
  /**
   * Ngắt kết nối từ thiết bị MikroTik
   * @param deviceId ID của thiết bị
   */
  async disconnect(deviceId: number): Promise<void> {
    const client = this.clients.get(deviceId);
    if (client) {
      await client.disconnect();
      this.clients.delete(deviceId);
    }
  }
  
  /**
   * Gửi lệnh đến thiết bị MikroTik
   * @param deviceId ID của thiết bị
   * @param command Lệnh cần gửi
   * @param params Tham số của lệnh (nếu có)
   * @returns Kết quả từ thiết bị
   */
  async sendCommand(deviceId: number, command: string, params: any[] = []): Promise<any> {
    const client = this.clients.get(deviceId);
    if (!client) {
      throw new Error(`No connection to device ${deviceId}`);
    }
    
    return await client.executeCommand(command, params);
  }
  
  async connectToDevice(deviceId: number): Promise<boolean> {
    const device = await storage.getDevice(deviceId);
    if (!device) {
      console.error(`Device with ID ${deviceId} not found`);
      return false;
    }
    
    try {
      console.log(`Connecting to device ${deviceId} (${device.ipAddress})...`);
      
      // Tạo client mới
      const client = new MikrotikClient(device.ipAddress, device.username, device.password);
      
      // Thử các cổng API khác nhau
      const ports = [8728, 8729, 80, 443];
      
      for (const port of ports) {
        try {
          console.log(`Trying to connect to ${device.ipAddress} on port ${port}... (Wait 20s for timeout)`);
          
          client.setPort(port);
          const connected = await client.connect(20000);
          
          if (connected) {
            console.log(`Successfully connected to ${device.ipAddress} on port ${port}`);
            this.clients.set(deviceId, client);
            return true;
          }
        } catch (error) {
          console.error(`Failed to connect to ${device.ipAddress} on port ${port}:`, error);
        }
      }
      
      console.error(`Failed to connect to device ${deviceId} (${device.ipAddress}) on any port`);
      
      await this.createAlert(
        deviceId,
        alertSeverity.ERROR,
        `Failed to connect to device on any port`,
        "connection"
      );
      
      return false;
    } catch (error) {
      console.error(`Error connecting to device ${deviceId}:`, error);
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
    const device = await storage.getDevice(deviceId);
    if (!device) {
      console.error(`Device with ID ${deviceId} not found`);
      return false;
    }
    
    try {
      // Lấy client hoặc tạo kết nối mới
      let client = this.clients.get(deviceId);
      
      if (!client) {
        console.log(`No existing connection to device ${deviceId}, attempting to connect...`);
        const connected = await this.connectToDevice(deviceId);
        
        if (!connected) {
          console.error(`Could not connect to device ${deviceId}`);
          
          await storage.updateDevice(deviceId, {
            isOnline: false,
            lastSeen: new Date()
          });
          
          return false;
        }
        
        client = this.clients.get(deviceId);
      }
      
      if (!client) {
        console.error(`Could not create client for device ${deviceId}`);
        return false;
      }
      
      try {
        // Thu thập thông tin hệ thống
        const resourcesData = await client.executeCommand('/system/resource/print');
        
        if (!Array.isArray(resourcesData) || resourcesData.length === 0) {
          throw new Error('Invalid system resource data');
        }
        
        const resources = resourcesData[0];
        
        // Thu thập thông tin router-board để lấy serial number
        const routerBoardData = await client.executeCommand('/system/routerboard/print');
        const routerBoard = Array.isArray(routerBoardData) && routerBoardData.length > 0 
          ? routerBoardData[0]
          : null;
        
        // Thu thập identity
        const identityData = await client.executeCommand('/system/identity/print');
        const identity = Array.isArray(identityData) && identityData.length > 0 
          ? identityData[0].name 
          : device.name;
        
        // Cập nhật thông tin thiết bị
        await storage.updateDevice(deviceId, {
          isOnline: true,
          lastSeen: new Date(),
          model: resources.board || resources['board-name'] || null,
          serialNumber: routerBoard?.['serial-number'] || resources['serial-number'] || null,
          routerOsVersion: resources.version || null,
          firmware: resources['firmware-type'] || routerBoard?.['firmware-type'] || null,
          cpu: resources['cpu-load'] || 0,
          totalMemory: resources['total-memory'] || 0,
          uptime: resources.uptime || '0d 0h 0m'
        });
        
        // Thu thập thông tin interfaces để tính lưu lượng mạng
        const interfaces = await client.executeCommand('/interface/print');
        let totalDownloadBandwidth = 0;
        let totalUploadBandwidth = 0;
        
        if (Array.isArray(interfaces) && interfaces.length > 0) {
          // Tính tổng bandwidth từ tất cả interfaces
          interfaces.forEach(iface => {
            // Chỉ tính các interface đang hoạt động và không phải loại bridge
            const isRunning = iface.running === 'true' || iface.running === true;
            const isDisabled = iface.disabled === 'true' || iface.disabled === true;
            const type = iface.type || '';
            
            if (isRunning && !isDisabled && type !== 'bridge') {
              // Lấy giá trị rx-byte và tx-byte
              const rxBytes = parseInt(iface['rx-byte'] || '0', 10);
              const txBytes = parseInt(iface['tx-byte'] || '0', 10);
              
              // Cộng dồn vào tổng bandwidth
              totalDownloadBandwidth += rxBytes;
              totalUploadBandwidth += txBytes;
            }
          });
        }
        
        // Lưu metric mới với thêm thông tin bandwidth
        const metric: InsertMetric = {
          deviceId,
          timestamp: new Date(),
          cpuLoad: parseInt(resources['cpu-load'] || '0', 10),
          memoryUsage: parseInt(resources['free-memory'] || '0', 10),
          uptime: resources.uptime || '0d 0h 0m',
          temperature: parseInt(resources.temperature || '0', 10),
          totalMemory: parseInt(resources['total-memory'] || '0', 10),
          downloadBandwidth: totalDownloadBandwidth,
          uploadBandwidth: totalUploadBandwidth,
          boardTemp: routerBoard?.temperature ? parseInt(routerBoard.temperature, 10) : null
        };
        
        await storage.createMetric(metric);
        
        // Thu thập thông tin interfaces
        await this.collectInterfaceStats(deviceId);
        
        // Thu thập thông tin wireless nếu có
        try {
          const wirelessData = await client.executeCommand('/interface/wireless/print');
          
          if (Array.isArray(wirelessData) && wirelessData.length > 0) {
            await storage.updateDevice(deviceId, { hasWireless: true });
            await wirelessService.collectWirelessStats(deviceId);
          } else {
            await storage.updateDevice(deviceId, { hasWireless: false });
          }
        } catch (error) {
          console.warn(`Device ${deviceId} does not have wireless interfaces:`, error);
          await storage.updateDevice(deviceId, { hasWireless: false });
        }
        
        // Thu thập thông tin CAPsMAN nếu có
        try {
          console.log(`Kiểm tra CAPsMAN trên thiết bị ${deviceId}...`);
          
          // Kiểm tra cách 1: Kiểm tra CAPsMAN Manager
          try {
            console.log(`Đang kiểm tra CAPsMAN manager...`);
            const capsmanManagerData = await client.executeCommand('/caps-man/manager/print');
            console.log(`CAPsMAN manager data:`, capsmanManagerData);
            
            if (Array.isArray(capsmanManagerData) && capsmanManagerData.length > 0) {
              const manager = capsmanManagerData[0];
              const isEnabled = manager.enabled === 'true' || manager.enabled === true;
              console.log(`CAPsMAN manager enabled: ${isEnabled}`);
              
              await storage.updateDevice(deviceId, { hasCAPsMAN: true });
              console.log(`Thiết lập hasCAPsMAN = true cho thiết bị ${deviceId} dựa vào kết quả kiểm tra manager`);
              
              // Nếu được kích hoạt, thu thập thêm thông tin
              if (isEnabled) {
                await capsmanService.collectCapsmanStats(deviceId);
              }
              
              return true; // Thoát khỏi quá trình kiểm tra nếu đã xác định được
            }
          } catch (managerError) {
            console.warn(`Không tìm thấy CAPsMAN manager:`, managerError);
          }
          
          // Kiểm tra cách 2: Kiểm tra CAPsMAN Configuration
          try {
            console.log(`Đang kiểm tra CAPsMAN configurations...`);
            const capsmanConfigData = await client.executeCommand('/caps-man/configuration/print');
            console.log(`CAPsMAN configurations data:`, capsmanConfigData);
            
            if (Array.isArray(capsmanConfigData) && capsmanConfigData.length > 0) {
              console.log(`Found ${capsmanConfigData.length} CAPsMAN configurations`);
              await storage.updateDevice(deviceId, { hasCAPsMAN: true });
              console.log(`Thiết lập hasCAPsMAN = true cho thiết bị ${deviceId} dựa vào kết quả kiểm tra configurations`);
              return true; // Thoát khỏi quá trình kiểm tra nếu đã xác định được
            }
          } catch (configError) {
            console.warn(`Không tìm thấy CAPsMAN configurations:`, configError);
          }
          
          // Kiểm tra cách 3: Kiểm tra CAPsMAN Access Points
          try {
            console.log(`Đang kiểm tra CAPsMAN access-point...`);
            const capsmanAPData = await client.executeCommand('/caps-man/access-point/print');
            console.log(`CAPsMAN access-point data:`, capsmanAPData);
            
            if (Array.isArray(capsmanAPData) && capsmanAPData.length > 0) {
              console.log(`Found ${capsmanAPData.length} CAPsMAN access points`);
              await storage.updateDevice(deviceId, { hasCAPsMAN: true });
              console.log(`Thiết lập hasCAPsMAN = true cho thiết bị ${deviceId} dựa vào kết quả kiểm tra access-point`);
              return true; // Thoát khỏi quá trình kiểm tra nếu đã xác định được
            }
          } catch (apError) {
            console.warn(`Không tìm thấy CAPsMAN access-point:`, apError);
          }
          
          // Kiểm tra cách 4: Kiểm tra CAPsMAN Interfaces
          try {
            console.log(`Đang kiểm tra CAPsMAN interfaces...`);
            const capsmanInterfaceData = await client.executeCommand('/caps-man/interface/print');
            console.log(`CAPsMAN interface data:`, capsmanInterfaceData);
            
            if (Array.isArray(capsmanInterfaceData) && capsmanInterfaceData.length > 0) {
              console.log(`Found ${capsmanInterfaceData.length} CAPsMAN interfaces`);
              await storage.updateDevice(deviceId, { hasCAPsMAN: true });
              console.log(`Thiết lập hasCAPsMAN = true cho thiết bị ${deviceId} dựa vào kết quả kiểm tra interfaces`);
              return true; // Thoát khỏi quá trình kiểm tra nếu đã xác định được
            }
          } catch (interfaceError) {
            console.warn(`Không tìm thấy CAPsMAN interfaces:`, interfaceError);
          }
          
          // Nếu không tìm thấy bất kỳ thành phần nào của CAPsMAN
          console.log(`Không tìm thấy bất kỳ thành phần CAPsMAN nào trên thiết bị ${deviceId}`);
          await storage.updateDevice(deviceId, { hasCAPsMAN: false });
          
        } catch (error) {
          console.error(`Lỗi không xác định khi kiểm tra CAPsMAN cho thiết bị ${deviceId}:`, error);
          await storage.updateDevice(deviceId, { hasCAPsMAN: false });
        }
        
        // Thu thập thông tin firewall rules
        await this.collectFirewallRules(deviceId);
        
        // Thu thập thông tin VPN connections
        await this.collectVpnConnections(deviceId);
        
        return true;
      } catch (error: any) {
        console.error(`Error collecting metrics for device ${deviceId}:`, error);
        
        await storage.updateDevice(deviceId, {
          isOnline: false,
          lastSeen: new Date()
        });
        
        await this.createAlert(
          deviceId,
          alertSeverity.ERROR,
          `Failed to collect metrics: ${error.message}`,
          "metrics"
        );
        
        await this.disconnectFromDevice(deviceId);
        
        return false;
      }
    } catch (error) {
      console.error(`Unexpected error while collecting metrics for device ${deviceId}:`, error);
      return false;
    }
  }
  
  public async createAlert(
    deviceId: number, 
    severity: AlertSeverity, 
    message: string, 
    source: string | null
  ): Promise<void> {
    try {
      const device = await storage.getDevice(deviceId);
      if (!device) {
        console.error(`Cannot create alert: Device with ID ${deviceId} not found`);
        return;
      }
      
      // Thêm thông tin về thiết bị vào cảnh báo
      let enhancedMessage = message;
      
      if (device.model) {
        enhancedMessage = `${device.model}: ${message}`;
      }
      
      // Bổ sung thông tin RouterOS nếu có lỗi liên quan đến firmware
      if (source === "connection" || source === "firmware") {
        if (device.routerOsVersion) {
          enhancedMessage += ` (RouterOS: ${device.routerOsVersion})`;
          
          // Thử kiểm tra thông tin phiên bản RouterOS
          try {
            const routerOsInfo = await deviceInfoService.getRouterOSInfo(device.routerOsVersion);
            
            if (typeof routerOsInfo === 'object' && 'release_date' in routerOsInfo && !('error' in routerOsInfo)) {
              enhancedMessage += ` - Released: ${routerOsInfo.release_date}`;
            }
          } catch (versionError) {
            console.warn(`Could not get RouterOS version info: ${versionError}`);
          }
        }
      }
      
      const alert: InsertAlert = {
        deviceId,
        timestamp: new Date(),
        severity,
        message: enhancedMessage,
        source
      };
      
      await storage.createAlert(alert);
      console.log(`Created new alert for device ${deviceId}: ${enhancedMessage}`);
    } catch (error) {
      console.error(`Error creating alert for device ${deviceId}:`, error);
    }
  }
  
  private async collectInterfaceStats(deviceId: number): Promise<void> {
    const client = this.clients.get(deviceId);
    if (!client) {
      throw new Error(`No connection to device ${deviceId}`);
    }
    
    try {
      // Lấy danh sách interfaces
      const interfaceData = await client.executeCommand('/interface/print');
      
      if (!Array.isArray(interfaceData)) {
        throw new Error('Invalid interface data format');
      }
      
      // Tạo cảnh báo nếu không có interfaces
      if (interfaceData.length === 0) {
        await this.createAlert(
          deviceId,
          alertSeverity.WARNING,
          'No interfaces found on device',
          "interface"
        );
        return;
      }
      
      // Lấy interfaces hiện có
      const existingInterfaces = await storage.getInterfaces(deviceId);
      
      for (const iface of interfaceData) {
        // Kiểm tra interface đã tồn tại
        const existingInterface = existingInterfaces.find(i => i.name === iface.name);
        
        // Chuyển đổi các giá trị string booleans sang boolean thực
        const isRunning = iface.running === 'true' || iface.running === true;
        const isDisabled = iface.disabled === 'true' || iface.disabled === true;
        
        if (existingInterface) {
          // Hàm để chuyển đổi an toàn từ string sang number
          const safeParseInt = (value: string | null | undefined, defaultValue = 0): number => {
            if (!value) return defaultValue;
            const parsed = parseInt(value, 10);
            return isNaN(parsed) ? defaultValue : parsed;
          }

          // Cập nhật interface
          await storage.updateInterface(existingInterface.id, {
            type: iface.type || 'unknown',
            macAddress: iface['mac-address'] || '00:00:00:00:00:00',
            comment: iface.comment || '',
            disabled: isDisabled,
            running: isRunning,
            mtu: safeParseInt(iface.mtu, 1500),
            rxBytes: safeParseInt(iface['rx-byte']),
            txBytes: safeParseInt(iface['tx-byte']),
            lastLinkUpTime: iface['last-link-up-time'] || null,
            linkDowns: safeParseInt(iface['link-downs']),
            txPackets: safeParseInt(iface['tx-packets']),
            rxPackets: safeParseInt(iface['rx-packets']),
            txDrops: safeParseInt(iface['tx-drops']),
            rxErrors: safeParseInt(iface['rx-errors']),
            txErrors: safeParseInt(iface['tx-errors']),
            rxDrops: safeParseInt(iface['rx-drops'])
          });
          
          // Tạo cảnh báo nếu interface down
          if (!isRunning && !isDisabled) {
            await this.createAlert(
              deviceId,
              alertSeverity.WARNING,
              `Interface ${iface.name} is down`,
              "interface"
            );
          }
        } else {
          // Hàm để chuyển đổi an toàn từ string sang number
          const safeParseInt = (value: string | null | undefined, defaultValue = 0): number => {
            if (!value) return defaultValue;
            const parsed = parseInt(value, 10);
            return isNaN(parsed) ? defaultValue : parsed;
          }

          // Tạo interface mới
          const newInterface: InsertInterface = {
            deviceId,
            name: iface.name || 'unknown',
            type: iface.type || 'unknown',
            macAddress: iface['mac-address'] || '00:00:00:00:00:00',
            comment: iface.comment || '',
            disabled: isDisabled,
            running: isRunning,
            mtu: safeParseInt(iface.mtu, 1500),
            rxBytes: safeParseInt(iface['rx-byte']),
            txBytes: safeParseInt(iface['tx-byte']),
            lastLinkUpTime: iface['last-link-up-time'] || null,
            linkDowns: safeParseInt(iface['link-downs']),
            txPackets: safeParseInt(iface['tx-packets']),
            rxPackets: safeParseInt(iface['rx-packets']),
            txDrops: safeParseInt(iface['tx-drops']),
            rxErrors: safeParseInt(iface['rx-errors']),
            txErrors: safeParseInt(iface['tx-errors']),
            rxDrops: safeParseInt(iface['rx-drops'])
          };
          
          const createdInterface = await storage.createInterface(newInterface);
          
          // Tạo cảnh báo nếu interface down
          if (!isRunning && !isDisabled) {
            await this.createAlert(
              deviceId,
              alertSeverity.WARNING,
              `Interface ${iface.name} is down`,
              "interface"
            );
          }
        }
      }
    } catch (error) {
      console.error(`Error collecting interface stats for device ${deviceId}:`, error);
      throw error;
    }
  }
  
  /**
   * Parse RouterOS uptime string to milliseconds
   * Example: "4w6h46m50s" -> 2608010000
   */
  public parseUptime(uptimeStr: string): number {
    try {
      const regex = /(?:(\d+)w)?(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/;
      const matches = uptimeStr.match(regex);
      if (!matches) return 0;
      
      const weeks = parseInt(matches[1] || '0') * 7 * 24 * 60 * 60 * 1000;
      const days = parseInt(matches[2] || '0') * 24 * 60 * 60 * 1000;
      const hours = parseInt(matches[3] || '0') * 60 * 60 * 1000;
      const minutes = parseInt(matches[4] || '0') * 60 * 1000;
      const seconds = parseInt(matches[5] || '0') * 1000;
      
      return weeks + days + hours + minutes + seconds;
    } catch (error) {
      console.error(`Error parsing uptime: ${uptimeStr}`, error);
      return 0;
    }
  }
  
  
  private async collectFirewallRules(deviceId: number): Promise<void> {
    const client = this.clients.get(deviceId);
    if (!client) {
      throw new Error(`No connection to device ${deviceId}`);
    }
    
    try {
      console.log(`Collecting firewall rules for device ${deviceId}...`);
      
      // Thu thập luật tường lửa từ filter chi tiết
      try {
        const filterRules = await client.executeCommand('/ip/firewall/filter/print', [
          { 'detail': '' }
        ]);
        
        if (Array.isArray(filterRules)) {
          // Đếm số lượng luật đang kích hoạt và bị vô hiệu hóa
          let activeRules = 0;
          let disabledRules = 0;
          let dropRules = 0;
          let rejectRules = 0;
          let acceptRules = 0;
          
          // Phân tích dữ liệu chi tiết về các luật
          for (const rule of filterRules) {
            console.log(`Filter rule:`, rule);
            
            if (rule.disabled === 'true' || rule.disabled === true) {
              disabledRules++;
            } else {
              activeRules++;
              
              // Phân loại theo action
              if (rule.action === 'drop') {
                dropRules++;
              } else if (rule.action === 'reject') {
                rejectRules++;
              } else if (rule.action === 'accept') {
                acceptRules++;
              }
            }
          }
          
          console.log(`Device ${deviceId} has ${activeRules} active and ${disabledRules} disabled firewall filter rules`);
          console.log(`Actions breakdown: ${acceptRules} accept, ${dropRules} drop, ${rejectRules} reject`);
          
          // Nếu có interface cho security trong ứng dụng, có thể gửi dữ liệu tổng hợp về
          // storage.updateFirewallStats(deviceId, {
          //   activeFilterRules: activeRules,
          //   disabledFilterRules: disabledRules,
          //   dropRules,
          //   rejectRules,
          //   acceptRules
          // });
        }
      } catch (filterError) {
        console.warn(`Error collecting filter rules:`, filterError);
      }
      
      // Thu thập luật tường lửa từ nat chi tiết
      try {
        const natRules = await client.executeCommand('/ip/firewall/nat/print', [
          { 'detail': '' }
        ]);
        
        if (Array.isArray(natRules)) {
          // Đếm số lượng luật NAT đang kích hoạt và bị vô hiệu hóa
          let activeNatRules = 0;
          let disabledNatRules = 0;
          let dstnatRules = 0;
          let srcnatRules = 0;
          let masqueradeRules = 0;
          
          for (const rule of natRules) {
            console.log(`NAT rule:`, rule);
            
            if (rule.disabled === 'true' || rule.disabled === true) {
              disabledNatRules++;
            } else {
              activeNatRules++;
              
              // Phân loại theo chain
              if (rule.chain === 'dstnat') {
                dstnatRules++;
              } else if (rule.chain === 'srcnat') {
                srcnatRules++;
                
                // Kiểm tra nếu là masquerade
                if (rule.action === 'masquerade') {
                  masqueradeRules++;
                }
              }
            }
          }
          
          console.log(`Device ${deviceId} has ${activeNatRules} active and ${disabledNatRules} disabled firewall NAT rules`);
          console.log(`NAT breakdown: ${dstnatRules} DSTNAT, ${srcnatRules} SRCNAT (${masqueradeRules} masquerade)`);
        }
      } catch (natError) {
        console.warn(`Error collecting NAT rules:`, natError);
      }
      
      // Thu thập thông tin về Address List
      try {
        const addressLists = await client.executeCommand('/ip/firewall/address-list/print');
        
        if (Array.isArray(addressLists)) {
          // Nhóm theo danh sách và đếm
          const listCounts = new Map<string, number>();
          
          for (const entry of addressLists) {
            const listName = entry.list || 'unknown';
            listCounts.set(listName, (listCounts.get(listName) || 0) + 1);
          }
          
          // Hiển thị thông tin
          console.log(`Address list statistics:`);
          for (const [list, count] of listCounts.entries()) {
            console.log(`- ${list}: ${count} entries`);
          }
        }
      } catch (addrError) {
        console.warn(`Error collecting address lists:`, addrError);
      }
      
      // Thu thập thông tin về Connection Tracking
      try {
        const connections = await client.executeCommand('/ip/firewall/connection/print', [
          { 'count-only': '' }
        ]);
        
        console.log(`Active connections:`, connections);
        
        // Lấy thống kê chi tiết về kết nối
        const connectionStats = await client.executeCommand('/ip/firewall/connection/print', [
          { 'stats': '' }
        ]);
        
        console.log(`Connection statistics:`, connectionStats);
      } catch (connError) {
        console.warn(`Error collecting connection stats:`, connError);
      }
      
    } catch (error) {
      console.error(`Error collecting firewall rules for device ${deviceId}:`, error);
      // Không ném lỗi, tiếp tục thu thập dữ liệu khác
    }
  }
  
  private async collectVpnConnections(deviceId: number): Promise<void> {
    const client = this.clients.get(deviceId);
    if (!client) {
      throw new Error(`No connection to device ${deviceId}`);
    }
    
    try {
      console.log(`Collecting VPN connections for device ${deviceId}...`);
      
      // Thu thập thông tin cấu hình VPN
      let vpnStats = {
        totalActive: 0,
        pptp: {
          active: 0,
          configured: 0,
          details: [] as any[]
        },
        l2tp: {
          active: 0,
          configured: 0,
          details: [] as any[]
        },
        sstp: {
          active: 0,
          configured: 0,
          details: [] as any[]
        },
        ovpn: {
          active: 0,
          configured: 0,
          details: [] as any[]
        }
      };
      
      // Kiểm tra cấu hình PPTP
      try {
        // Lấy thông tin cấu hình PPTP server
        const pptpConfig = await client.executeCommand('/interface/pptp-server/server/print');
        if (Array.isArray(pptpConfig)) {
          console.log(`PPTP server configuration:`, pptpConfig);
          
          // Kiểm tra xem PPTP server có được kích hoạt không
          const pptpEnabled = pptpConfig.length > 0 && pptpConfig[0].enabled === 'true';
          console.log(`PPTP server enabled: ${pptpEnabled}`);
          
          if (pptpEnabled) {
            // Lấy danh sách kết nối PPTP hiện tại
            const pptpConns = await client.executeCommand('/interface/pptp-server/print', [
              { 'detail': '' }
            ]);
            
            if (Array.isArray(pptpConns)) {
              vpnStats.pptp.active = pptpConns.length;
              vpnStats.pptp.details = pptpConns;
              vpnStats.totalActive += pptpConns.length;
              
              console.log(`Device ${deviceId} has ${pptpConns.length} PPTP server connections`);
              pptpConns.forEach((conn, idx) => {
                console.log(`PPTP connection ${idx + 1}:`, conn);
              });
            }
            
            // Lấy danh sách tài khoản PPTP
            try {
              const pptpSecrets = await client.executeCommand('/ppp/secret/print', [
                { 'where': 'service=pptp' }
              ]);
              
              if (Array.isArray(pptpSecrets)) {
                vpnStats.pptp.configured = pptpSecrets.length;
                console.log(`Device ${deviceId} has ${pptpSecrets.length} PPTP accounts configured`);
              }
            } catch (secretErr) {
              console.warn(`Error getting PPTP secrets:`, secretErr);
            }
          }
        }
      } catch (error) {
        console.warn(`Error collecting PPTP server info for device ${deviceId}:`, error);
      }
      
      // Kiểm tra cấu hình L2TP
      try {
        // Lấy thông tin cấu hình L2TP server
        const l2tpConfig = await client.executeCommand('/interface/l2tp-server/server/print');
        if (Array.isArray(l2tpConfig)) {
          console.log(`L2TP server configuration:`, l2tpConfig);
          
          // Kiểm tra xem L2TP server có được kích hoạt không
          const l2tpEnabled = l2tpConfig.length > 0 && l2tpConfig[0].enabled === 'true';
          console.log(`L2TP server enabled: ${l2tpEnabled}`);
          
          if (l2tpEnabled) {
            // Lấy danh sách kết nối L2TP hiện tại
            const l2tpConns = await client.executeCommand('/interface/l2tp-server/print', [
              { 'detail': '' }
            ]);
            
            if (Array.isArray(l2tpConns)) {
              vpnStats.l2tp.active = l2tpConns.length;
              vpnStats.l2tp.details = l2tpConns;
              vpnStats.totalActive += l2tpConns.length;
              
              console.log(`Device ${deviceId} has ${l2tpConns.length} L2TP server connections`);
              l2tpConns.forEach((conn, idx) => {
                console.log(`L2TP connection ${idx + 1}:`, conn);
              });
            }
            
            // Lấy danh sách tài khoản L2TP
            try {
              const l2tpSecrets = await client.executeCommand('/ppp/secret/print', [
                { 'where': 'service=l2tp' }
              ]);
              
              if (Array.isArray(l2tpSecrets)) {
                vpnStats.l2tp.configured = l2tpSecrets.length;
                console.log(`Device ${deviceId} has ${l2tpSecrets.length} L2TP accounts configured`);
              }
            } catch (secretErr) {
              console.warn(`Error getting L2TP secrets:`, secretErr);
            }
          }
        }
      } catch (error) {
        console.warn(`Error collecting L2TP server info for device ${deviceId}:`, error);
      }
      
      // Kiểm tra cấu hình SSTP
      try {
        // Lấy thông tin cấu hình SSTP server
        const sstpConfig = await client.executeCommand('/interface/sstp-server/server/print');
        if (Array.isArray(sstpConfig)) {
          console.log(`SSTP server configuration:`, sstpConfig);
          
          // Kiểm tra xem SSTP server có được kích hoạt không
          const sstpEnabled = sstpConfig.length > 0 && sstpConfig[0].enabled === 'true';
          console.log(`SSTP server enabled: ${sstpEnabled}`);
          
          if (sstpEnabled) {
            // Lấy danh sách kết nối SSTP hiện tại
            const sstpConns = await client.executeCommand('/interface/sstp-server/print', [
              { 'detail': '' }
            ]);
            
            if (Array.isArray(sstpConns)) {
              vpnStats.sstp.active = sstpConns.length;
              vpnStats.sstp.details = sstpConns;
              vpnStats.totalActive += sstpConns.length;
              
              console.log(`Device ${deviceId} has ${sstpConns.length} SSTP server connections`);
              sstpConns.forEach((conn, idx) => {
                console.log(`SSTP connection ${idx + 1}:`, conn);
              });
            }
            
            // Lấy danh sách tài khoản SSTP
            try {
              const sstpSecrets = await client.executeCommand('/ppp/secret/print', [
                { 'where': 'service=sstp' }
              ]);
              
              if (Array.isArray(sstpSecrets)) {
                vpnStats.sstp.configured = sstpSecrets.length;
                console.log(`Device ${deviceId} has ${sstpSecrets.length} SSTP accounts configured`);
              }
            } catch (secretErr) {
              console.warn(`Error getting SSTP secrets:`, secretErr);
            }
          }
        }
      } catch (error) {
        console.warn(`Error collecting SSTP server info for device ${deviceId}:`, error);
      }
      
      // Kiểm tra cấu hình OpenVPN
      try {
        // Lấy thông tin cấu hình OpenVPN server
        const ovpnServers = await client.executeCommand('/interface/ovpn-server/server/print');
        if (Array.isArray(ovpnServers)) {
          console.log(`OpenVPN server configuration:`, ovpnServers);
          
          // Đếm số lượng máy chủ OpenVPN được kích hoạt
          const ovpnEnabled = ovpnServers.filter(s => s.enabled === 'true').length > 0;
          console.log(`OpenVPN server enabled: ${ovpnEnabled}`);
          
          if (ovpnEnabled) {
            // Lấy danh sách kết nối OpenVPN hiện tại
            const ovpnConns = await client.executeCommand('/interface/ovpn-server/print', [
              { 'detail': '' }
            ]);
            
            if (Array.isArray(ovpnConns)) {
              vpnStats.ovpn.active = ovpnConns.length;
              vpnStats.ovpn.details = ovpnConns;
              vpnStats.totalActive += ovpnConns.length;
              
              console.log(`Device ${deviceId} has ${ovpnConns.length} OpenVPN server connections`);
              ovpnConns.forEach((conn, idx) => {
                console.log(`OpenVPN connection ${idx + 1}:`, conn);
              });
            }
          }
        }
      } catch (error) {
        console.warn(`Error collecting OpenVPN server info for device ${deviceId}:`, error);
      }
      
      // Tổng kết về các kết nối VPN
      console.log(`VPN connection summary for device ${deviceId}:`, vpnStats);
      console.log(`Total active VPN connections: ${vpnStats.totalActive}`);
      
      // Lưu cập nhật thông tin vào cơ sở dữ liệu (nếu cần)
      // await storage.updateVpnStats(deviceId, vpnStats);
      
    } catch (error) {
      console.error(`Error collecting VPN connections for device ${deviceId}:`, error);
      // Không ném lỗi, tiếp tục thu thập dữ liệu khác
    }
  }
  
  // Phương thức để phát hiện thiết bị MikroTik trên mạng
  public async discoverDevices(subnet: string): Promise<number> {
    console.log(`Starting device discovery on subnet ${subnet}...`);
    
    try {
      // Phân tích subnet
      const baseIp = subnet.split('/')[0];
      const parts = baseIp.split('.');
      const networkPrefix = `${parts[0]}.${parts[1]}.${parts[2]}`;
      
      // Số lượng thiết bị được tìm thấy
      let devicesFound = 0;
      
      // Quét subnet
      for (let i = 1; i < 255; i++) {
        const ipToCheck = `${networkPrefix}.${i}`;
        
        // Kiểm tra xem thiết bị đã tồn tại trong CSDL chưa
        const existingDevice = await storage.getDeviceByIp(ipToCheck);
        if (existingDevice) {
          console.log(`Device at ${ipToCheck} already exists in database, skipping...`);
          continue;
        }
        
        try {
          // Kiểm tra xem IP này có phải là thiết bị MikroTik không
          const isMikrotik = await this.checkIfMikrotik(ipToCheck, 'admin', 'admin');
          
          if (isMikrotik) {
            console.log(`Found MikroTik device at ${ipToCheck}`);
            
            // Lấy thông tin cơ bản về thiết bị
            let deviceModel = null;
            let routerOsVersion = null;
            
            try {
              // Thử kết nối để lấy thông tin model
              const tempClient = new MikrotikClient(ipToCheck, 'admin', 'admin');
              tempClient.setPort(8728);
              const connected = await tempClient.connect(5000);
              
              if (connected) {
                const resourcesData = await tempClient.executeCommand('/system/resource/print');
                if (Array.isArray(resourcesData) && resourcesData.length > 0) {
                  deviceModel = resourcesData[0].board || resourcesData[0]['board-name'];
                  routerOsVersion = resourcesData[0].version;
                }
                await tempClient.disconnect();
              }
            } catch (modelError) {
              console.warn(`Could not get model info for device at ${ipToCheck}:`, modelError);
            }
            
            // Tạo thiết bị mới trong CSDL với thông tin cơ bản
            const newDevice: InsertDevice = {
              name: `MikroTik-${ipToCheck}`,
              ipAddress: ipToCheck,
              username: 'admin', // Tên người dùng mặc định
              password: 'password', // Mật khẩu mặc định, nên thay đổi
              // Các trường này sẽ được tạo tự động bởi storage
              model: deviceModel,
              serialNumber: null,
              routerOsVersion: routerOsVersion,
              firmware: null,
              cpu: null,
              totalMemory: null,
              storage: null,
              hasCAPsMAN: false,
              hasWireless: false
            };
            
            const createdDevice = await storage.createDevice(newDevice);
            
            // Nếu có model, thử lấy thêm thông tin từ trang web MikroTik
            if (deviceModel) {
              try {
                console.log(`Enriching device information for model ${deviceModel}...`);
                const enrichedDevice = await deviceInfoService.enrichDeviceInfo(createdDevice);
                
                if (enrichedDevice !== createdDevice) {
                  await storage.updateDevice(createdDevice.id, enrichedDevice);
                  console.log(`Updated device ${createdDevice.id} with enriched information`);
                }
              } catch (enrichError) {
                console.warn(`Could not enrich device info for ${deviceModel}:`, enrichError);
              }
            }
            
            devicesFound++;
          }
        } catch (error) {
          // Bỏ qua lỗi và tiếp tục quét
          continue;
        }
      }
      
      return devicesFound;
    } catch (error) {
      console.error(`Error discovering devices:`, error);
      return 0;
    }
  }
  
  private async checkIfMikrotik(
    ipAddress: string, 
    username: string, 
    password: string
  ): Promise<boolean> {
    const testClient = new MikrotikClient(ipAddress, username, password);
    
    // Thử kết nối với các cổng API của MikroTik
    const ports = [8728, 8729, 80, 443];
    
    for (const port of ports) {
      testClient.setPort(port);
      
      try {
        // Sử dụng timeout ngắn để tăng tốc độ quét
        const connected = await testClient.connect(5000);
        
        if (connected) {
          // Thử thực hiện một lệnh đơn giản để xác nhận đây là thiết bị MikroTik
          try {
            const result = await testClient.executeCommand('/system/resource/print');
            if (Array.isArray(result) && result.length > 0) {
              // Đây là thiết bị MikroTik
              await testClient.disconnect();
              return true;
            }
          } catch (cmdError) {
            // Không phải thiết bị MikroTik
            await testClient.disconnect();
            return false;
          }
        }
      } catch (error) {
        // Bỏ qua lỗi và tiếp tục với cổng khác
        continue;
      }
    }
    
    return false;
  }
}

// Xuất một thể hiện duy nhất của dịch vụ MikroTik
export const mikrotikService = new MikrotikService();