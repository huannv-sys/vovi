import { db } from "../db";
import { networkDevices, deviceRoleEnum } from "@shared/schema";
import { eq } from "drizzle-orm";

// Mô tả các đặc điểm của từng loại thiết bị
interface DeviceSignature {
  role: typeof deviceRoleEnum.enumValues[number];
  patterns: {
    // Các mẫu để so khớp trong các trường khác nhau
    vendor?: string[]; // Mẫu tên nhà sản xuất
    deviceType?: string[]; // Mẫu loại thiết bị
    services?: number[]; // Các cổng dịch vụ mở
    userAgent?: string[]; // Mẫu User-Agent từ HTTP
    snmpOid?: string[]; // Mẫu OID từ SNMP
    deviceClass?: string[]; // Phân loại từ SNMP sysObjectID
  }
}

/**
 * Dịch vụ phân loại thiết bị dựa trên thông tin nhận diện
 */
export class DeviceClassifierService {
  private signatures: DeviceSignature[] = [];

  constructor() {
    this.initializeSignatures();
  }

  /**
   * Khởi tạo danh sách chữ ký để nhận diện thiết bị
   */
  private initializeSignatures() {
    // Router signatures
    this.signatures.push({
      role: "router",
      patterns: {
        vendor: ["mikrotik", "cisco", "juniper", "huawei", "fortinet", "ubiquiti", "edgerouter"],
        deviceType: ["router", "gateway", "firewall"],
        services: [22, 23, 53, 80, 443, 1723, 8291], // SSH, Telnet, DNS, HTTP, HTTPS, PPTP, Winbox
        snmpOid: [".1.3.6.1.4.1.14988", ".1.3.6.1.4.1.9.1", ".1.3.6.1.4.1.2636"]  // MikroTik, Cisco, Juniper
      }
    });

    // Switch signatures
    this.signatures.push({
      role: "switch",
      patterns: {
        vendor: ["cisco", "juniper", "mikrotik", "hp", "aruba", "dell", "netgear", "tp-link", "d-link", "unifi"],
        deviceType: ["switch", "switching"],
        services: [22, 23, 80, 443, 161], // SSH, Telnet, HTTP, HTTPS, SNMP
        deviceClass: ["NETWORK_SWITCH", "LAYER_2", "LAYER_3"]
      }
    });

    // Access Point signatures
    this.signatures.push({
      role: "access_point",
      patterns: {
        vendor: ["ubiquiti", "unifi", "mikrotik", "cisco", "aruba", "ruckus", "meraki", "tp-link", "zyxel"],
        deviceType: ["ap", "access point", "wireless", "wi-fi", "wifi"],
        services: [22, 80, 443, 8443], // SSH, HTTP, HTTPS
      }
    });

    // Server signatures
    this.signatures.push({
      role: "server",
      patterns: {
        vendor: ["dell", "hp", "ibm", "lenovo", "supermicro", "qnap", "synology"],
        deviceType: ["server", "vm", "virtual machine", "hypervisor", "nas"],
        services: [22, 80, 443, 445, 3389, 5900], // SSH, HTTP, HTTPS, SMB, RDP, VNC
        userAgent: ["apache", "nginx", "iis", "windows-server"]
      }
    });

    // Printer signatures
    this.signatures.push({
      role: "printer",
      patterns: {
        vendor: ["hp", "brother", "canon", "epson", "lexmark", "xerox", "konica", "kyocera"],
        deviceType: ["printer", "mfp", "scanner"],
        services: [80, 443, 515, 631, 9100], // HTTP, HTTPS, LPR, IPP, JetDirect
        deviceClass: ["PRINTER"]
      }
    });

    // Surveillance Camera signatures
    this.signatures.push({
      role: "camera",
      patterns: {
        vendor: ["hikvision", "dahua", "axis", "bosch", "hanwha", "vivotek", "tplink"],
        deviceType: ["camera", "ipcam", "nvr", "dvr", "surveillance"],
        services: [80, 443, 554], // HTTP, HTTPS, RTSP
        deviceClass: ["CAMERA"]
      }
    });

    // IoT device signatures
    this.signatures.push({
      role: "iot",
      patterns: {
        vendor: ["belkin", "wemo", "philips", "hue", "nest", "ring", "sonos", "ecobee", "tuya", "shelly"],
        deviceType: ["thermostat", "smart", "iot", "sensor", "bulb", "doorbell", "speaker"],
        services: [80, 443, 1900, 5353, 8080], // HTTP, HTTPS, UPNP, mDNS, HTTP Alt
      }
    });

    // Voice device signatures
    this.signatures.push({
      role: "voice",
      patterns: {
        vendor: ["polycom", "cisco", "avaya", "yealink", "grandstream", "snom"],
        deviceType: ["voip", "phone", "sip", "ipphone"],
        services: [5060, 5061, 4569], // SIP, SIP-TLS, IAX2
        deviceClass: ["VOIP"]
      }
    });

    // Endpoint signatures (PC, laptop, mobile)
    this.signatures.push({
      role: "endpoint",
      patterns: {
        vendor: ["intel", "apple", "dell", "lenovo", "hp", "asus", "acer", "samsung", "microsoft", "amd"],
        deviceType: ["pc", "desktop", "laptop", "workstation", "macbook", "iphone", "android", "tablet", "ipad"],
        services: [135, 139, 445, 3389, 5900], // RPC, NetBIOS, SMB, RDP, VNC
        userAgent: ["windows", "macos", "ios", "android", "chrome", "firefox", "safari", "edge"]
      }
    });
  }

  /**
   * Phân loại thiết bị dựa trên thông tin nhận diện
   * @param deviceId ID của thiết bị mạng cần phân loại
   */
  async classifyDevice(deviceId: number) {
    // Lấy thông tin thiết bị từ cơ sở dữ liệu
    const [device] = await db.select().from(networkDevices).where(eq(networkDevices.id, deviceId));
    
    if (!device) {
      console.error(`Device with ID ${deviceId} not found`);
      return null;
    }
    
    // Nếu đã có phân loại và điểm nhận diện cao, sử dụng phân loại hiện tại
    if (device.deviceRole && device.deviceRole !== 'unknown' && device.identificationScore && device.identificationScore > 70) {
      return device.deviceRole;
    }
    
    // Chuẩn bị dữ liệu để phân tích
    const deviceData = device.deviceData || {};
    const metadata = device.metadata || {};
    const openPorts = metadata.openPorts || [];
    const httpHeaders = metadata.httpHeaders || {};
    const snmpData = metadata.snmpData || {};
    
    // Điểm số cho từng loại vai trò
    const roleScores: Record<string, number> = {};
    
    // Tính điểm cho từng chữ ký
    for (const signature of this.signatures) {
      let score = 0;
      const patterns = signature.patterns;
      
      // Kiểm tra nhà sản xuất
      if (patterns.vendor && device.vendor) {
        for (const vendorPattern of patterns.vendor) {
          if (device.vendor.toLowerCase().includes(vendorPattern.toLowerCase())) {
            score += 20;
            break;
          }
        }
      }
      
      // Kiểm tra loại thiết bị
      if (patterns.deviceType && device.deviceType) {
        for (const typePattern of patterns.deviceType) {
          if (device.deviceType.toLowerCase().includes(typePattern.toLowerCase())) {
            score += 25;
            break;
          }
        }
      }
      
      // Kiểm tra các cổng dịch vụ mở
      if (patterns.services && openPorts.length > 0) {
        let portMatches = 0;
        for (const port of patterns.services) {
          if (openPorts.includes(port)) {
            portMatches++;
          }
        }
        
        // Tính điểm dựa trên số lượng cổng khớp
        if (portMatches > 0) {
          const portMatchRatio = portMatches / patterns.services.length;
          score += Math.min(20, Math.round(portMatchRatio * 30));
        }
      }
      
      // Kiểm tra User-Agent từ HTTP
      if (patterns.userAgent && httpHeaders['user-agent']) {
        const userAgent = httpHeaders['user-agent'].toLowerCase();
        for (const uaPattern of patterns.userAgent) {
          if (userAgent.includes(uaPattern.toLowerCase())) {
            score += 15;
            break;
          }
        }
      }
      
      // Kiểm tra OID từ SNMP
      if (patterns.snmpOid && snmpData.sysObjectID) {
        for (const oidPattern of patterns.snmpOid) {
          if (snmpData.sysObjectID.startsWith(oidPattern)) {
            score += 35;
            break;
          }
        }
      }
      
      // Kiểm tra phân loại từ SNMP/Device Discovery
      if (patterns.deviceClass && metadata.deviceClass) {
        for (const classPattern of patterns.deviceClass) {
          if (metadata.deviceClass.toUpperCase().includes(classPattern)) {
            score += 30;
            break;
          }
        }
      }
      
      // Lưu điểm cho vai trò này
      roleScores[signature.role] = score;
    }
    
    // Xác định vai trò có điểm cao nhất
    let highestRole: string = 'unknown';
    let highestScore = 0;
    
    for (const [role, score] of Object.entries(roleScores)) {
      if (score > highestScore) {
        highestScore = score;
        highestRole = role;
      }
    }
    
    // Nếu không có vai trò nào đạt điểm tối thiểu, giữ nguyên 'unknown'
    if (highestScore < 30) {
      highestRole = 'unknown';
    }
    
    // Cập nhật vai trò của thiết bị trong cơ sở dữ liệu
    try {
      await db.update(networkDevices)
        .set({ 
          deviceRole: highestRole as any, 
          metadata: {
            ...metadata,
            roleClassification: {
              classifiedAt: new Date().toISOString(),
              scores: roleScores,
              selectedRole: highestRole,
              confidence: highestScore
            }
          }
        })
        .where(eq(networkDevices.id, deviceId));
        
      console.log(`Classified device ${deviceId} as ${highestRole} with score ${highestScore}`);
      return highestRole;
    } catch (error) {
      console.error(`Error updating device role for ${deviceId}:`, error);
      return null;
    }
  }
  
  /**
   * Phân loại lại tất cả các thiết bị đã nhận diện trong hệ thống
   */
  async reclassifyAllDevices() {
    // Lấy danh sách các thiết bị đã được nhận diện
    const devices = await db.select({id: networkDevices.id})
      .from(networkDevices)
      .where(eq(networkDevices.isIdentified, true));
    
    console.log(`Reclassifying ${devices.length} identified devices...`);
    
    let successCount = 0;
    for (const device of devices) {
      try {
        await this.classifyDevice(device.id);
        successCount++;
      } catch (error) {
        console.error(`Error classifying device ${device.id}:`, error);
      }
    }
    
    console.log(`Reclassification completed. Successfully classified ${successCount}/${devices.length} devices`);
    return successCount;
  }
  
  /**
   * Lấy phương thức giám sát phù hợp cho từng loại thiết bị
   * @param deviceRole Vai trò của thiết bị
   */
  getMonitoringMethodsForRole(deviceRole: typeof deviceRoleEnum.enumValues[number] | string | null) {
    // Đảm bảo deviceRole là giá trị hợp lệ, nếu không thì sẽ sử dụng 'unknown'
    const validRole = deviceRole && typeof deviceRole === 'string' && deviceRoleEnum.enumValues.includes(deviceRole as any) 
      ? deviceRole 
      : 'unknown';
    const methods: Record<string, {
      priority: string[],  // Phương thức ưu tiên theo thứ tự
      metrics: string[],   // Các metrics cần thu thập
      interval: number     // Khoảng thời gian giám sát (ms)
    }> = {
      // Router - ưu tiên SNMP, hỗ trợ Netflow
      router: {
        priority: ['snmp', 'netflow', 'api', 'ping'],
        metrics: ['cpu', 'memory', 'disk', 'uptime', 'temperature', 'interfaces', 'traffic', 'routes'],
        interval: 60000 // 1 phút
      },
      
      // Switch - ưu tiên SNMP
      switch: {
        priority: ['snmp', 'api', 'ping'],
        metrics: ['cpu', 'memory', 'uptime', 'temperature', 'interfaces', 'traffic', 'portStatus'],
        interval: 120000 // 2 phút
      },
      
      // Access Point - ưu tiên SNMP, API hoặc CAPsMAN
      access_point: {
        priority: ['snmp', 'api', 'capsman', 'ping'],
        metrics: ['cpu', 'memory', 'uptime', 'clients', 'traffic', 'signal', 'channel', 'interference'],
        interval: 120000 // 2 phút
      },
      
      // Server - ưu tiên SNMP, hỗ trợ agent nếu có
      server: {
        priority: ['snmp', 'agent', 'wmi', 'ping'],
        metrics: ['cpu', 'memory', 'disk', 'uptime', 'temperature', 'services', 'processes'],
        interval: 60000 // 1 phút
      },
      
      // Printer - ưu tiên SNMP
      printer: {
        priority: ['snmp', 'http', 'ping'],
        metrics: ['toner', 'paper', 'queue', 'errors', 'uptime'],
        interval: 300000 // 5 phút
      },
      
      // Camera - ưu tiên HTTP/RTSP
      camera: {
        priority: ['rtsp', 'http', 'onvif', 'ping'],
        metrics: ['status', 'uptime', 'stream', 'storage'],
        interval: 300000 // 5 phút
      },
      
      // Voice devices - ưu tiên SIP
      voice: {
        priority: ['sip', 'http', 'snmp', 'ping'],
        metrics: ['status', 'calls', 'quality', 'uptime'],
        interval: 180000 // 3 phút
      },
      
      // IoT devices - ưu tiên HTTP
      iot: {
        priority: ['http', 'mqtt', 'ping'],
        metrics: ['status', 'uptime', 'battery'],
        interval: 600000 // 10 phút
      },
      
      // Endpoints - giám sát thụ động
      endpoint: {
        priority: ['passive', 'ping', 'agent'],
        metrics: ['status', 'traffic'],
        interval: 900000 // 15 phút
      },
      
      // Thiết bị không xác định - chỉ ping cơ bản
      unknown: {
        priority: ['ping', 'passive'],
        metrics: ['status', 'traffic'],
        interval: 1800000 // 30 phút
      }
    };
    
    return methods[validRole as keyof typeof methods] || methods.unknown;
  }
}

// Xuất một thể hiện duy nhất của service
export const deviceClassifierService = new DeviceClassifierService();