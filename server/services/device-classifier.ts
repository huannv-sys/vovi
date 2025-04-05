import { NetworkDeviceDetails } from '../mikrotik-api-types';

/**
 * Phân loại thiết bị dựa vào thông tin thu thập được
 * @param device Thông tin thiết bị
 * @returns Loại thiết bị đã phân loại
 */
export async function classifyDevice(device: NetworkDeviceDetails): Promise<string | null> {
  try {
    // Đã có loại thiết bị được xác định rõ ràng
    if (device.deviceType && device.deviceType !== 'Unknown' && device.deviceType !== 'unknown') {
      return device.deviceType;
    }
    
    // 1. Phân loại dựa trên hãng sản xuất
    if (device.vendor) {
      const vendorLower = device.vendor.toLowerCase();
      
      // Nhà sản xuất thiết bị mạng phổ biến
      if (
        vendorLower.includes('mikrotik') ||
        vendorLower.includes('cisco') ||
        vendorLower.includes('aruba') ||
        vendorLower.includes('ubiquiti') ||
        vendorLower.includes('ruckus') ||
        vendorLower.includes('juniper') ||
        vendorLower.includes('huawei') ||
        vendorLower.includes('fortinet')
      ) {
        return 'Router';
      }
      
      // Nhà sản xuất thiết bị điện thoại/di động
      if (
        vendorLower.includes('apple') ||
        vendorLower.includes('samsung') ||
        vendorLower.includes('xiaomi') ||
        vendorLower.includes('oppo') ||
        vendorLower.includes('nokia') ||
        vendorLower.includes('motorola') ||
        vendorLower.includes('oneplus') ||
        vendorLower.includes('vivo')
      ) {
        return 'Mobile';
      }
      
      // Nhà sản xuất laptop/PC
      if (
        vendorLower.includes('dell') ||
        vendorLower.includes('lenovo') ||
        vendorLower.includes('acer') ||
        vendorLower.includes('asus') ||
        vendorLower.includes('hp') ||
        vendorLower.includes('intel') ||
        vendorLower.includes('microsoft')
      ) {
        return 'Computer';
      }
      
      // Nhà sản xuất thiết bị IoT
      if (
        vendorLower.includes('espressif') ||
        vendorLower.includes('raspberry') ||
        vendorLower.includes('arduino') ||
        vendorLower.includes('shenzhen') ||
        vendorLower.includes('tuya') ||
        vendorLower.includes('sonoff')
      ) {
        return 'IoT';
      }
      
      // Nhà sản xuất máy in
      if (
        vendorLower.includes('brother') ||
        vendorLower.includes('canon') ||
        vendorLower.includes('epson') ||
        vendorLower.includes('ricoh') ||
        vendorLower.includes('xerox') ||
        vendorLower.includes('hewlett packard') ||
        vendorLower.includes('kyocera')
      ) {
        return 'Printer';
      }
      
      // Nhà sản xuất camera
      if (
        vendorLower.includes('hikvision') ||
        vendorLower.includes('axis') ||
        vendorLower.includes('dahua') ||
        vendorLower.includes('avigilon') ||
        vendorLower.includes('bosch') ||
        vendorLower.includes('vivotek') ||
        vendorLower.includes('hanwha')
      ) {
        return 'Camera';
      }
    }
    
    // 2. Phân loại dựa trên metadata (nếu có)
    if (device.metadata) {
      // Phân loại dựa trên port đang mở
      if (device.metadata.openPorts && Array.isArray(device.metadata.openPorts)) {
        const ports = device.metadata.openPorts;
        
        // Router hoặc network device
        if (
          ports.includes(80) && 
          (ports.includes(443) || ports.includes(8291) || ports.includes(8728) || ports.includes(8729))
        ) {
          return 'Router';
        }
        
        // Printer
        if (ports.includes(631) || ports.includes(9100)) {
          return 'Printer';
        }
        
        // Camera
        if (ports.includes(554) || (ports.includes(80) && ports.includes(8000))) {
          return 'Camera';
        }
        
        // NAS/Storage
        if (ports.includes(445) || ports.includes(139) || ports.includes(111)) {
          return 'Storage';
        }
        
        // Server
        if (ports.includes(22) && (ports.includes(80) || ports.includes(443)) && ports.includes(3306)) {
          return 'Server';
        }
        
        // IoT device
        if (ports.includes(1883) || ports.includes(8883)) {
          return 'IoT';
        }
        
        // VOIP/Phone
        if (ports.includes(5060) || ports.includes(5061)) {
          return 'Phone';
        }
        
        // PC/Laptop - thường có ít port đang mở
        if (ports.length < 5 && (ports.includes(135) || ports.includes(139) || ports.includes(445))) {
          return 'Computer';
        }
      }
      
      // Phân loại dựa trên thông tin SNMP (nếu có)
      if (device.metadata.snmpData) {
        const snmpData = device.metadata.snmpData;
        
        if (snmpData.sysDescr) {
          const sysDescr = snmpData.sysDescr.toLowerCase();
          
          if (
            sysDescr.includes('router') || 
            sysDescr.includes('switch') || 
            sysDescr.includes('gateway')
          ) {
            return 'Router';
          }
          
          if (sysDescr.includes('printer') || sysDescr.includes('printing')) {
            return 'Printer';
          }
          
          if (sysDescr.includes('camera') || sysDescr.includes('surveillance')) {
            return 'Camera';
          }
          
          if (sysDescr.includes('server') || sysDescr.includes('windows') || sysDescr.includes('linux')) {
            return 'Server';
          }
        }
      }
    }
    
    // 3. Phân loại dựa trên hostname (nếu có)
    if (device.hostName) {
      const hostnameLower = device.hostName.toLowerCase();
      
      if (
        hostnameLower.includes('router') || 
        hostnameLower.includes('gateway') || 
        hostnameLower.includes('mikrotik') || 
        hostnameLower.includes('ap') || 
        hostnameLower.includes('wifi')
      ) {
        return 'Router';
      }
      
      if (
        hostnameLower.includes('printer') || 
        hostnameLower.includes('print') || 
        hostnameLower.includes('scan')
      ) {
        return 'Printer';
      }
      
      if (
        hostnameLower.includes('cam') || 
        hostnameLower.includes('camera') || 
        hostnameLower.includes('ipcam')
      ) {
        return 'Camera';
      }
      
      if (hostnameLower.includes('phone') || hostnameLower.includes('voip')) {
        return 'Phone';
      }
      
      if (hostnameLower.includes('laptop') || hostnameLower.includes('desktop')) {
        return 'Computer';
      }
      
      if (
        hostnameLower.includes('server') || 
        hostnameLower.includes('srv') || 
        hostnameLower.includes('nas')
      ) {
        return 'Server';
      }
    }
    
    // Không thể xác định loại thiết bị
    return device.deviceType || 'Unknown';
  } catch (error) {
    console.error('Error classifying device:', error);
    return null;
  }
}