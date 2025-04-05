import { NetworkDeviceDetails } from '../mikrotik-api-types';
import * as discovery from './discovery';
import * as fs from 'fs';
import * as path from 'path';

// Hàm này định danh thiết bị bằng cách sử dụng các phương pháp khác nhau
export async function identifyDevice(device: NetworkDeviceDetails): Promise<NetworkDeviceDetails | null> {
  try {
    const enhancedDevice = { ...device };
    
    // Phương pháp 1: Xác định nhà sản xuất từ MAC Address
    if (device.macAddress && !device.vendor) {
      const vendor = await getVendorFromMac(device.macAddress);
      if (vendor) {
        enhancedDevice.vendor = vendor;
      }
    }
    
    // Phương pháp 2: Thử các port phổ biến
    if (device.ipAddress) {
      const openPorts = await discovery.scanCommonPorts(device.ipAddress);
      
      if (!enhancedDevice.metadata) {
        enhancedDevice.metadata = {};
      }
      
      enhancedDevice.metadata.openPorts = openPorts;
      
      // Dựa vào port để xác định loại thiết bị
      enhancedDevice.deviceType = determineDeviceTypeFromPorts(openPorts, enhancedDevice.deviceType);
    }
    
    // Phương pháp 3: Lấy hostname nếu chưa có
    if (device.ipAddress && !device.hostName) {
      const hostname = await discovery.getDeviceHostname(device.ipAddress);
      if (hostname) {
        enhancedDevice.hostName = hostname;
      }
    }
    
    return enhancedDevice;
  } catch (error) {
    console.error('Error identifying device:', error);
    return null;
  }
}

// Lấy tên nhà sản xuất từ MAC Address
async function getVendorFromMac(macAddress: string): Promise<string | null> {
  try {
    // Chuẩn hóa MAC address
    const normalizedMac = macAddress.replace(/[:-]/g, '').toUpperCase();
    const prefix = normalizedMac.substring(0, 6);
    
    // Đọc cơ sở dữ liệu OUI (từ file OUI đã cache)
    const ouiDbPath = path.join(process.cwd(), 'assets', 'oui-database.json');
    
    if (fs.existsSync(ouiDbPath)) {
      const ouiDb = JSON.parse(fs.readFileSync(ouiDbPath, 'utf8'));
      return ouiDb[prefix] || null;
    }
    
    return null;
  } catch (error) {
    console.error('Error getting vendor from MAC:', error);
    return null;
  }
}

// Xác định loại thiết bị dựa vào các port đang mở
function determineDeviceTypeFromPorts(ports: number[], currentType: string | undefined): string | undefined {
  if (!ports || ports.length === 0) {
    return currentType;
  }
  
  // Nếu đã có loại thiết bị, giữ nguyên
  if (currentType && currentType !== 'unknown') {
    return currentType;
  }
  
  // Chuỗi các port đang mở
  const portsStr = ports.join(',');
  
  // Router hoặc network device
  if (ports.includes(80) && (ports.includes(443) || ports.includes(8291) || ports.includes(8728) || ports.includes(8729))) {
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
  
  // Mặc định
  return currentType || 'Unknown';
}