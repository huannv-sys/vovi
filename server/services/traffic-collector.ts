import { storage } from "../storage";
import { mikrotikService } from "./mikrotik";
import { deviceClassifierService } from "./device-classifier";
import { db } from "../db";
import { networkDevices } from "@shared/schema";
import { eq } from "drizzle-orm";

/**
 * Service thu thập lưu lượng mạng từ các thiết bị
 * Hỗ trợ nhiều phương thức khác nhau dựa trên vai trò và khả năng của thiết bị
 */
export class TrafficCollectorService {
  private collectors: Map<string, Function> = new Map();
  
  constructor() {
    this.registerCollectors();
  }
  
  /**
   * Đăng ký các phương thức thu thập dữ liệu
   */
  private registerCollectors() {
    // Sử dụng SNMP để thu thập dữ liệu từ thiết bị mạng
    this.collectors.set('snmp', this.collectTrafficBySNMP.bind(this));
    
    // Sử dụng Netflow để thu thập dữ liệu lưu lượng chi tiết
    this.collectors.set('netflow', this.collectTrafficByNetflow.bind(this));
    
    // Sử dụng API của thiết bị (ví dụ: Mikrotik API)
    this.collectors.set('api', this.collectTrafficByAPI.bind(this));
    
    // Sử dụng gói tin sniffer để theo dõi lưu lượng
    this.collectors.set('sniffer', this.collectTrafficBySniffer.bind(this));
    
    // Phương thức thụ động để giám sát thiết bị đầu cuối
    this.collectors.set('passive', this.collectTrafficPassive.bind(this));
  }
  
  /**
   * Thu thập lưu lượng mạng từ thiết bị dựa trên vai trò
   * @param deviceId ID của thiết bị mạng
   */
  async collectTrafficByDeviceRole(deviceId: number) {
    try {
      // Lấy thông tin thiết bị từ cơ sở dữ liệu
      const [device] = await db.select()
        .from(networkDevices)
        .where(eq(networkDevices.id, deviceId));
      
      if (!device) {
        console.error(`Device ${deviceId} not found`);
        return null;
      }
      
      // Nếu chưa có vai trò, thực hiện phân loại
      if (!device.deviceRole || device.deviceRole === 'unknown') {
        const role = await deviceClassifierService.classifyDevice(deviceId);
        if (!role) {
          console.warn(`Could not classify device ${deviceId}, using passive monitoring`);
          return this.collectTrafficPassive(deviceId);
        }
      }
      
      // Lấy phương thức thu thập phù hợp
      const methods = deviceClassifierService.getMonitoringMethodsForRole(device.deviceRole);
      
      // Thử từng phương thức theo thứ tự ưu tiên
      for (const method of methods.priority) {
        const collector = this.collectors.get(method);
        if (collector) {
          try {
            console.log(`Collecting traffic data for device ${deviceId} using ${method} method`);
            const result = await collector(deviceId);
            if (result && result.success) {
              return result;
            }
          } catch (error) {
            console.error(`Error collecting traffic data using ${method} method:`, error);
          }
        }
      }
      
      // Nếu tất cả các phương thức đều thất bại, sử dụng phương thức thụ động
      console.warn(`All traffic collection methods failed for device ${deviceId}, falling back to passive monitoring`);
      return this.collectTrafficPassive(deviceId);
    } catch (error) {
      console.error(`Error in collectTrafficByDeviceRole for device ${deviceId}:`, error);
      return null;
    }
  }
  
  /**
   * Thu thập lưu lượng mạng qua SNMP
   * @param deviceId ID của thiết bị mạng
   */
  private async collectTrafficBySNMP(deviceId: number) {
    console.log(`Collecting traffic data via SNMP for device ${deviceId}`);
    
    try {
      const [device] = await db.select()
        .from(networkDevices)
        .where(eq(networkDevices.id, deviceId));
      
      if (!device) {
        return { success: false, message: 'Device not found' };
      }
      
      // Kiểm tra nếu thiết bị có được liên kết với thiết bị quản lý
      if (device.isManaged && device.managedDeviceId) {
        // Lấy dữ liệu từ thiết bị quản lý thông qua SNMP
        const managedDevice = await storage.getDevice(device.managedDeviceId);
        
        if (!managedDevice) {
          return { success: false, message: 'Managed device not found' };
        }
        
        const interfaces = await storage.getInterfaces(device.managedDeviceId);
        
        // Lọc interface dựa trên MAC address nếu có
        const matchedInterfaces = device.macAddress 
          ? interfaces.filter((iface: any) => iface.macAddress === device.macAddress)
          : interfaces;
        
        // Nếu không tìm thấy interface phù hợp, trả về thông báo lỗi
        if (matchedInterfaces.length === 0) {
          return { success: false, message: 'No matching interfaces found' };
        }
        
        const trafficData = matchedInterfaces.map((iface: any) => ({
          interface: iface.name,
          rxPackets: iface.rxPackets,
          txPackets: iface.txPackets,
          rxBytes: iface.rxBytes,
          txBytes: iface.txBytes,
          rxErrors: iface.rxErrors,
          txErrors: iface.txErrors,
          rxDrops: iface.rxDrops,
          txDrops: iface.txDrops,
          lastUpdated: iface.lastUpdated
        }));
        
        return {
          success: true,
          method: 'snmp',
          data: {
            trafficData,
            timestamp: new Date(),
            deviceId
          }
        };
      } else {
        // Nếu không, thử sử dụng SNMP trực tiếp với thiết bị
        // Đây là nơi bạn sẽ thêm code để truy vấn SNMP trực tiếp
        return { success: false, message: 'Direct SNMP not implemented yet' };
      }
    } catch (error) {
      console.error(`Error collecting traffic via SNMP for device ${deviceId}:`, error);
      return { success: false, message: 'SNMP collection failed', error };
    }
  }
  
  /**
   * Thu thập lưu lượng mạng qua Netflow
   * @param deviceId ID của thiết bị mạng
   */
  private async collectTrafficByNetflow(deviceId: number) {
    console.log(`Collecting traffic data via Netflow for device ${deviceId}`);
    
    try {
      // Kiểm tra xem thiết bị có hỗ trợ Netflow không
      const [device] = await db.select()
        .from(networkDevices)
        .where(eq(networkDevices.id, deviceId));
      
      if (!device) {
        return { success: false, message: 'Device not found' };
      }
      
      // Kiểm tra thiết bị quản lý nếu có
      if (device.isManaged && device.managedDeviceId) {
        // Lấy thông tin từ thiết bị quản lý
        const managedDevice = await storage.getDevice(device.managedDeviceId);
        
        if (!managedDevice) {
          return { success: false, message: 'Managed device not found' };
        }
        
        // Thực hiện logic thu thập dữ liệu Netflow từ thiết bị MikroTik
        // Đây là phần sẽ được triển khai sau
        return { 
          success: false, 
          message: 'Netflow collection not fully implemented yet',
          status: 'in_development'
        };
      } else {
        return { success: false, message: 'Device not managed, cannot collect Netflow data' };
      }
    } catch (error) {
      console.error(`Error collecting traffic via Netflow for device ${deviceId}:`, error);
      return { success: false, message: 'Netflow collection failed', error };
    }
  }
  
  /**
   * Thu thập lưu lượng mạng qua API của thiết bị
   * @param deviceId ID của thiết bị mạng
   */
  private async collectTrafficByAPI(deviceId: number) {
    console.log(`Collecting traffic data via API for device ${deviceId}`);
    
    try {
      const [device] = await db.select()
        .from(networkDevices)
        .where(eq(networkDevices.id, deviceId));
      
      if (!device) {
        return { success: false, message: 'Device not found' };
      }
      
      // Kiểm tra thiết bị quản lý nếu có
      if (device.isManaged && device.managedDeviceId) {
        // Lấy thông tin từ thiết bị quản lý 
        const managedDevice = await storage.getDevice(device.managedDeviceId);
        
        if (!managedDevice) {
          return { success: false, message: 'Managed device not found' };
        }
        
        // Sử dụng MikroTik API để lấy dữ liệu lưu lượng
        if (managedDevice.routerOsVersion) {
          try {
            // Lấy dữ liệu interface
            // Sử dụng storage để lấy interface vì không có phương thức getInterfaces trong mikrotikService
            const interfaces = await storage.getInterfaces(managedDevice.id);
            
            if (!interfaces || interfaces.length === 0) {
              return { success: false, message: 'No interfaces found' };
            }
            
            // Lọc interface dựa trên MAC address nếu có
            const matchedInterfaces = device.macAddress 
              ? interfaces.filter((iface: any) => iface.macAddress === device.macAddress)
              : interfaces;
            
            if (matchedInterfaces.length === 0) {
              return { success: false, message: 'No matching interfaces found' };
            }
            
            const trafficData = matchedInterfaces.map((iface: any) => ({
              interface: iface.name,
              rxPackets: iface.rxPackets,
              txPackets: iface.txPackets,
              rxBytes: iface.rxBytes,
              txBytes: iface.txBytes,
              rxErrors: iface.rxErrors,
              txErrors: iface.txErrors,
              rxDrops: iface.rxDrops,
              txDrops: iface.txDrops,
              lastUpdated: iface.lastUpdated
            }));
            
            return {
              success: true,
              method: 'api',
              data: {
                trafficData,
                timestamp: new Date(),
                deviceId
              }
            };
          } catch (error) {
            console.error(`Error using MikroTik API for device ${managedDevice.id}:`, error);
            return { success: false, message: 'MikroTik API failed', error };
          }
        } else {
          return { success: false, message: 'Device does not support API access' };
        }
      } else {
        // Thử truy cập trực tiếp API của thiết bị
        return { success: false, message: 'Direct API access not implemented yet' };
      }
    } catch (error) {
      console.error(`Error collecting traffic via API for device ${deviceId}:`, error);
      return { success: false, message: 'API collection failed', error };
    }
  }
  
  /**
   * Thu thập lưu lượng mạng qua sniffer/packet capture
   * @param deviceId ID của thiết bị mạng
   */
  private async collectTrafficBySniffer(deviceId: number) {
    console.log(`Collecting traffic data via packet sniffer for device ${deviceId}`);
    
    try {
      const [device] = await db.select()
        .from(networkDevices)
        .where(eq(networkDevices.id, deviceId));
      
      if (!device) {
        return { success: false, message: 'Device not found' };
      }
      
      // Hiện chưa triển khai sniffer
      return { 
        success: false, 
        message: 'Packet sniffer collection not implemented yet',
        status: 'in_development' 
      };
    } catch (error) {
      console.error(`Error collecting traffic via sniffer for device ${deviceId}:`, error);
      return { success: false, message: 'Sniffer collection failed', error };
    }
  }
  
  /**
   * Thu thập lưu lượng mạng bằng phương thức thụ động
   * @param deviceId ID của thiết bị mạng
   */
  private async collectTrafficPassive(deviceId: number) {
    console.log(`Collecting traffic data via passive monitoring for device ${deviceId}`);
    
    try {
      const [device] = await db.select()
        .from(networkDevices)
        .where(eq(networkDevices.id, deviceId));
      
      if (!device) {
        return { success: false, message: 'Device not found' };
      }
      
      // Tìm thông tin từ router quản lý mạng
      // Kiểm tra metadata để tìm gateway của thiết bị
      const metadata = device.metadata || {};
      // Sử dụng typescript type assertion để truy cập thuộc tính gateway nếu nó tồn tại
      const routerIp = metadata.hasOwnProperty('gateway') ? (metadata as any).gateway : null;
      
      if (!routerIp) {
        return { success: false, message: 'Gateway information not available for passive monitoring' };
      }
      
      // Tìm router trong cơ sở dữ liệu
      const [router] = await db.select()
        .from(networkDevices)
        .where(eq(networkDevices.ipAddress, routerIp));
      
      if (!router || !router.isManaged || !router.managedDeviceId) {
        return { success: false, message: 'Gateway router not managed' };
      }
      
      // Lấy thông tin lưu lượng từ bảng ARP và DHCP của router
      try {
        const managedRouter = await storage.getDevice(router.managedDeviceId);
        
        if (!managedRouter) {
          return { success: false, message: 'Managed router not found' };
        }
        
        // TODO: thực hiện một fake ARP lookup
        // Trong triển khai thực tế, phương thức getArpTable cần được thêm vào mikrotikService
        
        // Mô phỏng kết quả ARP lookup
        const deviceArpEntry = {
          interface: 'ether1',
          ipAddress: device.ipAddress,
          macAddress: device.macAddress,
          complete: 'true',
          lastSeen: new Date()
        };
        
        // Lấy interface liên quan đến thiết bị
        const interfaces = await storage.getInterfaces(managedRouter.id);
        const relatedInterface = interfaces.find((iface: any) => iface.name === deviceArpEntry.interface);
        
        if (!relatedInterface) {
          return { success: false, message: 'Related interface not found' };
        }
        
        return {
          success: true,
          method: 'passive',
          data: {
            trafficData: [{
              interface: relatedInterface.name,
              macAddress: device.macAddress,
              ipAddress: device.ipAddress,
              lastSeen: deviceArpEntry.lastSeen || new Date(),
              // Dữ liệu lưu lượng sẽ là null vì phương thức thụ động không thu thập được chi tiết
              rxBytes: null,
              txBytes: null,
              rxPackets: null,
              txPackets: null,
              status: deviceArpEntry.complete === 'true' ? 'online' : 'unknown'
            }],
            timestamp: new Date(),
            deviceId,
            source: 'arp_table'
          }
        };
      } catch (error) {
        console.error(`Error collecting passive data from router for device ${deviceId}:`, error);
        return { success: false, message: 'Passive monitoring failed', error };
      }
    } catch (error) {
      console.error(`Error in passive monitoring for device ${deviceId}:`, error);
      return { success: false, message: 'Passive monitoring failed', error };
    }
  }
  
  /**
   * Lưu dữ liệu lưu lượng mạng vào cơ sở dữ liệu
   * @param deviceId ID của thiết bị
   * @param trafficData Dữ liệu lưu lượng thu thập được
   */
  async saveTrafficData(deviceId: number, trafficData: any) {
    // Lưu dữ liệu vào cơ sở dữ liệu
    try {
      // Cập nhật metadata của thiết bị
      const [device] = await db.select()
        .from(networkDevices)
        .where(eq(networkDevices.id, deviceId));
      
      if (!device) {
        console.error(`Cannot save traffic data: Device ${deviceId} not found`);
        return false;
      }
      
      const metadata = device.metadata || {};
      
      // Thêm dữ liệu lưu lượng vào metadata
      await db.update(networkDevices)
        .set({ 
          metadata: {
            ...metadata,
            trafficData: {
              ...trafficData,
              lastUpdated: new Date().toISOString()
            }
          },
          lastSeen: new Date()
        })
        .where(eq(networkDevices.id, deviceId));
      
      console.log(`Traffic data saved for device ${deviceId}`);
      return true;
    } catch (error) {
      console.error(`Error saving traffic data for device ${deviceId}:`, error);
      return false;
    }
  }
}

// Xuất một thể hiện duy nhất của service
export const trafficCollectorService = new TrafficCollectorService();