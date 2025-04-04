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

// Sử dụng thư viện node-routeros để kết nối với RouterOS
import * as RouterOS from 'node-routeros';

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

  async connect(timeout = 10000): Promise<boolean> {
    try {
      console.log(`Connecting to ${this.ipAddress}:${this.port} as ${this.username}`);
      
      const connectionConfig = {
        host: this.ipAddress,
        user: this.username,
        password: this.password,
        port: this.port,
        timeout: timeout
      };
      
      console.log(`Connection config: ${JSON.stringify({...connectionConfig, password: '******'})}`);
      
      // Tạo kết nối mới
      this.connection = new RouterOS.RouterOSAPI(connectionConfig);
      
      try {
        // Thiết lập timeout cho kết nối
        const connectPromise = this.connection.connect();
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Connection timed out after ${timeout}ms`));
          }, timeout);
        });
        
        await Promise.race([connectPromise, timeoutPromise]);
        
        console.log(`Successfully connected to ${this.ipAddress}`);
        this.connected = true;
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
          console.log(`Trying to connect to ${device.ipAddress} on port ${port}... (Wait 10s for timeout)`);
          
          client.setPort(port);
          const connected = await client.connect(10000);
          
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
        null
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
          serialNumber: resources['serial-number'] || null,
          routerOsVersion: resources.version || null,
          firmware: resources['firmware-type'] || null,
          cpu: resources['cpu-load'] || 0,
          totalMemory: resources['total-memory'] || 0,
          uptime: resources.uptime || '0d 0h 0m'
        });
        
        // Lưu metric mới
        const metric: InsertMetric = {
          deviceId,
          timestamp: new Date(),
          cpuLoad: parseInt(resources['cpu-load'] || '0', 10),
          memoryUsage: parseInt(resources['free-memory'] || '0', 10),
          uptime: resources.uptime || '0d 0h 0m',
          temperature: parseInt(resources.temperature || '0', 10)
        };
        
        await storage.createMetric(metric);
        
        // Thu thập thông tin interfaces
        await this.collectInterfaceStats(deviceId);
        
        // Thu thập thông tin wireless nếu có
        try {
          const wirelessData = await client.executeCommand('/interface/wireless/print');
          
          if (Array.isArray(wirelessData) && wirelessData.length > 0) {
            await storage.updateDevice(deviceId, { hasWireless: true });
            await this.collectWirelessStats(deviceId);
          } else {
            await storage.updateDevice(deviceId, { hasWireless: false });
          }
        } catch (error) {
          console.warn(`Device ${deviceId} does not have wireless interfaces:`, error);
          await storage.updateDevice(deviceId, { hasWireless: false });
        }
        
        // Thu thập thông tin CAPsMAN nếu có
        try {
          const capsmanData = await client.executeCommand('/caps-man/interface/print');
          
          if (Array.isArray(capsmanData) && capsmanData.length > 0) {
            await storage.updateDevice(deviceId, { hasCAPsMAN: true });
            await this.collectCapsmanStats(deviceId);
          } else {
            await storage.updateDevice(deviceId, { hasCAPsMAN: false });
          }
        } catch (error) {
          console.warn(`Device ${deviceId} does not have CAPsMAN:`, error);
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
          null
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
    resourceId: number | null
  ): Promise<void> {
    try {
      const device = await storage.getDevice(deviceId);
      if (!device) {
        console.error(`Cannot create alert: Device with ID ${deviceId} not found`);
        return;
      }
      
      const alert: InsertAlert = {
        deviceId,
        timestamp: new Date(),
        severity,
        message,
        acknowledged: false
      };
      
      await storage.createAlert(alert);
      console.log(`Created new alert for device ${deviceId}: ${message}`);
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
          null
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
          // Cập nhật interface
          await storage.updateInterface(existingInterface.id, {
            type: iface.type || 'unknown',
            macAddress: iface['mac-address'] || '00:00:00:00:00:00',
            comment: iface.comment || '',
            disabled: isDisabled,
            running: isRunning,
            mtu: parseInt(iface.mtu || '1500', 10),
            rxBytes: parseInt(iface['rx-byte'] || '0', 10),
            txBytes: parseInt(iface['tx-byte'] || '0', 10),
            lastLinkUpTime: iface['last-link-up-time'] || null,
            linkDowns: parseInt(iface['link-downs'] || '0', 10),
            txPackets: parseInt(iface['tx-packets'] || '0', 10),
            rxPackets: parseInt(iface['rx-packets'] || '0', 10),
            txDrops: parseInt(iface['tx-drops'] || '0', 10),
            rxDrops: parseInt(iface['rx-drops'] || '0', 10),
            txErrors: parseInt(iface['tx-errors'] || '0', 10),
            rxErrors: parseInt(iface['rx-errors'] || '0', 10)
          });
          
          // Tạo cảnh báo nếu interface down
          if (!isRunning && !isDisabled) {
            await this.createAlert(
              deviceId,
              alertSeverity.WARNING,
              `Interface ${iface.name} is down`,
              existingInterface.id
            );
          }
        } else {
          // Tạo interface mới
          const newInterface: InsertInterface = {
            deviceId,
            name: iface.name || 'unknown',
            type: iface.type || 'unknown',
            macAddress: iface['mac-address'] || '00:00:00:00:00:00',
            comment: iface.comment || '',
            disabled: isDisabled,
            running: isRunning,
            mtu: parseInt(iface.mtu || '1500', 10),
            rxBytes: parseInt(iface['rx-byte'] || '0', 10),
            txBytes: parseInt(iface['tx-byte'] || '0', 10),
            lastLinkUpTime: iface['last-link-up-time'] || null,
            linkDowns: parseInt(iface['link-downs'] || '0', 10),
            txPackets: parseInt(iface['tx-packets'] || '0', 10),
            rxPackets: parseInt(iface['rx-packets'] || '0', 10),
            txDrops: parseInt(iface['tx-drops'] || '0', 10),
            rxDrops: parseInt(iface['rx-drops'] || '0', 10),
            txErrors: parseInt(iface['tx-errors'] || '0', 10),
            rxErrors: parseInt(iface['rx-errors'] || '0', 10)
          };
          
          const createdInterface = await storage.createInterface(newInterface);
          
          // Tạo cảnh báo nếu interface down
          if (!isRunning && !isDisabled) {
            await this.createAlert(
              deviceId,
              alertSeverity.WARNING,
              `Interface ${iface.name} is down`,
              createdInterface.id
            );
          }
        }
      }
    } catch (error) {
      console.error(`Error collecting interface stats for device ${deviceId}:`, error);
      throw error;
    }
  }
  
  private async collectWirelessStats(deviceId: number): Promise<void> {
    const client = this.clients.get(deviceId);
    if (!client) {
      throw new Error(`No connection to device ${deviceId}`);
    }
    
    try {
      // Lấy danh sách wireless interfaces
      const wirelessData = await client.executeCommand('/interface/wireless/print');
      
      if (!Array.isArray(wirelessData)) {
        throw new Error('Invalid wireless interface data format');
      }
      
      // Đánh dấu các wireless interfaces hiện tại để xóa những interface không còn tồn tại
      const currentWirelessIds = new Set<number>();
      const existingWirelessInterfaces = await storage.getWirelessInterfaces(deviceId);
      
      for (const wifiIface of wirelessData) {
        // Tìm wireless interface đã tồn tại trong cơ sở dữ liệu
        const existingWifi = existingWirelessInterfaces.find(w => w.name === wifiIface.name);
        
        if (existingWifi) {
          // Cập nhật wireless interface
          await storage.updateWirelessInterface(existingWifi.id, {
            ssid: wifiIface.ssid || '',
            mode: wifiIface.mode || 'ap-bridge',
            band: wifiIface.band || '2ghz-b/g/n',
            channel: wifiIface.channel ? wifiIface.channel.toString() : '',
            txPower: wifiIface['tx-power'] ? wifiIface['tx-power'].toString() : '',
            disabled: wifiIface.disabled === 'true' || wifiIface.disabled === true,
            running: wifiIface.running === 'true' || wifiIface.running === true
          });
          
          currentWirelessIds.add(existingWifi.id);
        } else {
          // Tạo wireless interface mới
          const newWirelessInterface: InsertWirelessInterface = {
            deviceId,
            name: wifiIface.name || 'unknown',
            macAddress: wifiIface['mac-address'] || '00:00:00:00:00:00',
            ssid: wifiIface.ssid || '',
            mode: wifiIface.mode || 'ap-bridge',
            band: wifiIface.band || '2ghz-b/g/n',
            channel: wifiIface.channel ? wifiIface.channel.toString() : '',
            txPower: wifiIface['tx-power'] ? wifiIface['tx-power'].toString() : '',
            disabled: wifiIface.disabled === 'true' || wifiIface.disabled === true,
            running: wifiIface.running === 'true' || wifiIface.running === true,
            clients: 0
          };
          
          const createdWifi = await storage.createWirelessInterface(newWirelessInterface);
          currentWirelessIds.add(createdWifi.id);
        }
      }
      
      // Xóa wireless interfaces không còn tồn tại
      for (const wifiIface of existingWirelessInterfaces) {
        if (!currentWirelessIds.has(wifiIface.id)) {
          await storage.deleteWirelessInterface(wifiIface.id);
        }
      }
    } catch (error) {
      console.error(`Error collecting wireless stats for device ${deviceId}:`, error);
      throw error;
    }
  }
  
  private async collectCapsmanStats(deviceId: number): Promise<void> {
    const client = this.clients.get(deviceId);
    if (!client) {
      throw new Error(`No connection to device ${deviceId}`);
    }
    
    try {
      // Lấy danh sách CAPsMAN Access Points
      const capsmanAPData = await client.executeCommand('/caps-man/access-point/print');
      
      if (!Array.isArray(capsmanAPData)) {
        throw new Error('Invalid CAPsMAN AP data format');
      }
      
      // Đánh dấu các CAPsMAN APs hiện tại để xóa những AP không còn tồn tại
      const currentAPIds = new Set<number>();
      const existingAPs = await storage.getCapsmanAPs(deviceId);
      
      for (const ap of capsmanAPData) {
        // Tìm CAPsMAN AP đã tồn tại trong cơ sở dữ liệu
        const existingAP = existingAPs.find(a => a.name === ap.name || a.macAddress === ap['mac-address']);
        
        if (existingAP) {
          // Cập nhật CAPsMAN AP
          await storage.updateCapsmanAP(existingAP.id, {
            name: ap.name || 'unknown',
            macAddress: ap['mac-address'] || '00:00:00:00:00:00',
            model: ap.model || '',
            identity: ap.identity || '',
            version: ap.version || '',
            radioMac: ap['radio-mac'] || ap['mac-address'] || '',
            state: ap.state || 'unknown'
          });
          
          currentAPIds.add(existingAP.id);
          
          // Thu thập clients cho AP này
          await this.collectCapsmanClients(deviceId, existingAP.id);
        } else {
          // Tạo CAPsMAN AP mới
          const newCap: InsertCapsmanAP = {
            deviceId,
            name: ap.name || 'unknown',
            macAddress: ap['mac-address'] || '00:00:00:00:00:00',
            model: ap.model || '',
            identity: ap.identity || '',
            serialNumber: ap['serial-number'] || '',
            version: ap.version || '',
            radioMac: ap['radio-mac'] || ap['mac-address'] || '',
            state: ap.state || 'unknown'
          };
          
          const createdAP = await storage.createCapsmanAP(newCap);
          currentAPIds.add(createdAP.id);
          
          // Thu thập clients cho AP mới
          await this.collectCapsmanClients(deviceId, createdAP.id);
        }
      }
      
      // Xóa CAPsMAN APs không còn tồn tại
      for (const ap of existingAPs) {
        if (!currentAPIds.has(ap.id)) {
          await storage.deleteCapsmanAP(ap.id);
        }
      }
    } catch (error) {
      console.error(`Error collecting CAPsMAN stats for device ${deviceId}:`, error);
      throw error;
    }
  }
  
  private async collectCapsmanClients(deviceId: number, apId: number): Promise<void> {
    const client = this.clients.get(deviceId);
    if (!client) {
      throw new Error(`No connection to device ${deviceId}`);
    }
    
    try {
      const ap = await storage.getCapsmanAP(apId);
      if (!ap) {
        throw new Error(`CAPsMAN AP with ID ${apId} not found`);
      }
      
      // Lấy danh sách clients kết nối vào AP này
      const registrationData = await client.executeCommand('/caps-man/registration-table/print');
      
      if (!Array.isArray(registrationData)) {
        throw new Error('Invalid CAPsMAN client data format');
      }
      
      // Lọc clients cho AP hiện tại
      const apClients = registrationData.filter(c => 
        c['radio-mac'] === ap.radioMac || 
        c['interface'] === ap.name ||
        c['ap-mac'] === ap.macAddress
      );
      
      // Đánh dấu các clients hiện tại để xóa những client không còn tồn tại
      const currentClientIds = new Set<number>();
      const existingClients = await storage.getCapsmanClients(apId);
      
      for (const clientData of apClients) {
        const macAddress = clientData['mac-address'] || '';
        
        // Tìm client đã tồn tại trong cơ sở dữ liệu
        const existingClient = existingClients.find(c => c.macAddress === macAddress);
        
        if (existingClient) {
          // Cập nhật client
          await storage.updateCapsmanClient(existingClient.id, {
            ipAddress: clientData.ip || '',
            username: clientData.user || '',
            signalStrength: parseInt(clientData.signal || '0', 10),
            interface: clientData.interface || '',
            hostname: clientData['host-name'] || '',
            txRate: clientData['tx-rate'] || '',
            rxRate: clientData['rx-rate'] || '',
            connectedTime: clientData.uptime || ''
          });
          
          currentClientIds.add(existingClient.id);
        } else {
          // Tạo client mới
          const newClient: InsertCapsmanClient = {
            deviceId,
            apId,
            macAddress,
            ipAddress: clientData.ip || '',
            username: clientData.user || '',
            signalStrength: parseInt(clientData.signal || '0', 10),
            interface: clientData.interface || '',
            hostname: clientData['host-name'] || '',
            txRate: clientData['tx-rate'] || '',
            rxRate: clientData['rx-rate'] || '',
            connectedTime: clientData.uptime || ''
          };
          
          const createdClient = await storage.createCapsmanClient(newClient);
          currentClientIds.add(createdClient.id);
        }
      }
      
      // Xóa clients không còn tồn tại
      for (const existingClient of existingClients) {
        if (!currentClientIds.has(existingClient.id)) {
          await storage.deleteCapsmanClient(existingClient.id);
        }
      }
    } catch (error) {
      console.error(`Error collecting CAPsMAN clients for device ${deviceId} and AP ${apId}:`, error);
      throw error;
    }
  }
  
  private async collectFirewallRules(deviceId: number): Promise<void> {
    const client = this.clients.get(deviceId);
    if (!client) {
      throw new Error(`No connection to device ${deviceId}`);
    }
    
    try {
      // Thu thập luật tường lửa từ filter 
      const filterRules = await client.executeCommand('/ip/firewall/filter/print');
      
      if (Array.isArray(filterRules)) {
        // Đếm số lượng luật đang kích hoạt và bị vô hiệu hóa
        let activeRules = 0;
        let disabledRules = 0;
        
        for (const rule of filterRules) {
          if (rule.disabled === 'true' || rule.disabled === true) {
            disabledRules++;
          } else {
            activeRules++;
          }
        }
        
        console.log(`Device ${deviceId} has ${activeRules} active and ${disabledRules} disabled firewall filter rules`);
      }
      
      // Thu thập luật tường lửa từ nat
      const natRules = await client.executeCommand('/ip/firewall/nat/print');
      
      if (Array.isArray(natRules)) {
        // Đếm số lượng luật NAT đang kích hoạt và bị vô hiệu hóa
        let activeNatRules = 0;
        let disabledNatRules = 0;
        
        for (const rule of natRules) {
          if (rule.disabled === 'true' || rule.disabled === true) {
            disabledNatRules++;
          } else {
            activeNatRules++;
          }
        }
        
        console.log(`Device ${deviceId} has ${activeNatRules} active and ${disabledNatRules} disabled firewall NAT rules`);
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
      // Thu thập thông tin VPN PPTP
      try {
        const pptpConns = await client.executeCommand('/interface/pptp-server/print');
        if (Array.isArray(pptpConns)) {
          console.log(`Device ${deviceId} has ${pptpConns.length} PPTP server connections`);
        }
      } catch (error) {
        console.warn(`Error collecting PPTP server connections for device ${deviceId}:`, error);
      }
      
      // Thu thập thông tin VPN L2TP
      try {
        const l2tpConns = await client.executeCommand('/interface/l2tp-server/print');
        if (Array.isArray(l2tpConns)) {
          console.log(`Device ${deviceId} has ${l2tpConns.length} L2TP server connections`);
        }
      } catch (error) {
        console.warn(`Error collecting L2TP server connections for device ${deviceId}:`, error);
      }
      
      // Thu thập thông tin VPN SSTP
      try {
        const sstpConns = await client.executeCommand('/interface/sstp-server/print');
        if (Array.isArray(sstpConns)) {
          console.log(`Device ${deviceId} has ${sstpConns.length} SSTP server connections`);
        }
      } catch (error) {
        console.warn(`Error collecting SSTP server connections for device ${deviceId}:`, error);
      }
      
      // Thu thập thông tin VPN OpenVPN
      try {
        const ovpnConns = await client.executeCommand('/interface/ovpn-server/print');
        if (Array.isArray(ovpnConns)) {
          console.log(`Device ${deviceId} has ${ovpnConns.length} OpenVPN server connections`);
        }
      } catch (error) {
        console.warn(`Error collecting OpenVPN server connections for device ${deviceId}:`, error);
      }
      
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
            
            // Tạo thiết bị mới trong CSDL với thông tin cơ bản
            const newDevice: InsertDevice = {
              name: `MikroTik-${ipToCheck}`,
              ipAddress: ipToCheck,
              username: 'admin', // Tên người dùng mặc định
              password: 'password', // Mật khẩu mặc định, nên thay đổi
              isOnline: false,
              lastSeen: new Date(),
              uptime: '0d 0h 0m',
              model: null,
              serialNumber: null,
              routerOsVersion: null,
              firmware: null,
              cpu: null,
              totalMemory: null,
              storage: null,
              hasCAPsMAN: false,
              hasWireless: false
            };
            
            await storage.createDevice(newDevice);
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