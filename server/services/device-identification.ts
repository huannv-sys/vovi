import { exec } from "child_process";
import { promisify } from "util";
import { NetworkDevice } from "@shared/schema";
import { deviceDiscoveryService } from "./discovery";
import { mikrotikService } from "./mikrotik";
import { storage } from "../storage";
import { db } from "../db";
import { networkDevices } from "@shared/schema";
import { eq } from "drizzle-orm";
import * as http from "http";
import * as https from "https";

const execPromise = promisify(exec);

/**
 * Service nhận diện thiết bị
 */
export class DeviceIdentificationService {
  /**
   * Nhận diện thông tin thiết bị thông qua nhiều phương thức
   * @param networkDeviceId ID của thiết bị mạng cần nhận diện
   * @returns Thiết bị sau khi nhận diện
   */
  public async identifyDevice(networkDeviceId: number): Promise<NetworkDevice | undefined> {
    try {
      // Lấy thông tin thiết bị
      const [device] = await db.select().from(networkDevices).where(eq(networkDevices.id, networkDeviceId));
      if (!device) {
        throw new Error(`Network device with ID ${networkDeviceId} not found`);
      }

      let identificationScore = device.identificationScore || 0;
      const deviceData = device.deviceData as Record<string, any> || {};
      let isIdentified = false;

      // 1. SNMP Identification
      try {
        const snmpData = await this.identifyDeviceBySNMP(device.ipAddress);
        if (snmpData) {
          isIdentified = true;
          identificationScore += 40;
          Object.assign(deviceData, { snmp: snmpData });
        }
      } catch (error) {
        console.log(`SNMP identification failed for ${device.ipAddress}`);
      }

      // 2. HTTP/HTTPS Banner
      try {
        const httpData = await this.getHttpBanner(device.ipAddress);
        if (httpData) {
          isIdentified = true;
          identificationScore += 20;
          Object.assign(deviceData, { http: httpData });
        }
      } catch (error) {
        console.log(`HTTP banner identification failed for ${device.ipAddress}`);
      }

      // 3. Port Scan
      try {
        const portScanData = await this.scanPorts(device.ipAddress);
        if (portScanData && portScanData.openPorts.length > 0) {
          isIdentified = true;
          identificationScore += 15;
          Object.assign(deviceData, { ports: portScanData });
        }
      } catch (error) {
        console.log(`Port scan failed for ${device.ipAddress}`);
      }

      // 4. LLDP/CDP (nếu có thiết bị MikroTik quản lý)
      try {
        // Tìm thiết bị MikroTik quản lý mạng
        const managedDevices = await storage.getAllDevices();
        for (const managedDevice of managedDevices) {
          const lldpData = await this.getLLDPNeighborsFromMikrotik(managedDevice.id, device.ipAddress);
          if (lldpData && lldpData.length > 0) {
            isIdentified = true;
            identificationScore += 30;
            Object.assign(deviceData, { lldp: lldpData });
            break;
          }
        }
      } catch (error) {
        console.log(`LLDP/CDP identification failed for ${device.ipAddress}`);
      }

      // Cập nhật thiết bị với thông tin mới
      await db.update(networkDevices)
        .set({
          isIdentified,
          identificationScore,
          deviceData,
          deviceType: this.determineDeviceType(deviceData)
        })
        .where(eq(networkDevices.id, device.id));

      // Lấy thiết bị đã cập nhật
      const [updatedDevice] = await db.select().from(networkDevices).where(eq(networkDevices.id, device.id));
      return updatedDevice;
    } catch (error) {
      console.error(`Error identifying device (ID: ${networkDeviceId}):`, error);
      return undefined;
    }
  }

  /**
   * Nhận diện thiết bị qua SNMP
   * @param ipAddress Địa chỉ IP của thiết bị
   * @returns Dữ liệu SNMP hoặc undefined nếu không lấy được
   */
  private async identifyDeviceBySNMP(ipAddress: string): Promise<any | undefined> {
    try {
      // Thử với một số community strings phổ biến
      const communityStrings = ['public', 'private', 'community'];
      
      for (const community of communityStrings) {
        try {
          // Lấy sysDescr (OID 1.3.6.1.2.1.1.1.0)
          const { stdout: sysDescr } = await execPromise(
            `snmpget -v2c -c ${community} -t 5 ${ipAddress} 1.3.6.1.2.1.1.1.0`,
            { timeout: 10000 }
          );
          
          if (sysDescr && !sysDescr.includes('Timeout') && !sysDescr.includes('Error')) {
            // Nếu sysDescr thành công, lấy thêm các thông tin khác
            const { stdout: sysName } = await execPromise(
              `snmpget -v2c -c ${community} -t 5 ${ipAddress} 1.3.6.1.2.1.1.5.0`,
              { timeout: 5000 }
            ).catch(() => ({ stdout: '' }));
            
            const { stdout: sysLocation } = await execPromise(
              `snmpget -v2c -c ${community} -t 5 ${ipAddress} 1.3.6.1.2.1.1.6.0`,
              { timeout: 5000 }
            ).catch(() => ({ stdout: '' }));
            
            const { stdout: sysContact } = await execPromise(
              `snmpget -v2c -c ${community} -t 5 ${ipAddress} 1.3.6.1.2.1.1.4.0`,
              { timeout: 5000 }
            ).catch(() => ({ stdout: '' }));
            
            // Parse kết quả
            const extractValue = (output: string) => {
              const match = output.match(/STRING: "(.*?)"|STRING: (.*?)$/);
              return match ? (match[1] || match[2])?.trim() : undefined;
            };
            
            return {
              sysDescr: extractValue(sysDescr),
              sysName: extractValue(sysName),
              sysLocation: extractValue(sysLocation),
              sysContact: extractValue(sysContact),
              community // Lưu community string thành công
            };
          }
        } catch (error) {
          // Bỏ qua lỗi và thử community khác
          continue;
        }
      }
      
      return undefined;
    } catch (error) {
      console.error(`SNMP identification error for ${ipAddress}:`, error);
      return undefined;
    }
  }

  /**
   * Lấy thông tin banner HTTP/HTTPS từ thiết bị
   * @param ipAddress Địa chỉ IP của thiết bị
   * @returns Thông tin banner hoặc undefined nếu không lấy được
   */
  private async getHttpBanner(ipAddress: string): Promise<any | undefined> {
    const results: any = {};
    
    // Kiểm tra HTTP (port 80)
    try {
      const headers = await this.getHttpHeaders(`http://${ipAddress}`);
      if (headers) {
        results.http = headers;
      }
    } catch (error) {
      // Bỏ qua lỗi
    }
    
    // Kiểm tra HTTPS (port 443)
    try {
      const headers = await this.getHttpHeaders(`https://${ipAddress}`);
      if (headers) {
        results.https = headers;
      }
    } catch (error) {
      // Bỏ qua lỗi
    }
    
    // Kiểm tra các port web phổ biến khác
    const additionalPorts = [8080, 8443, 8000, 8888];
    for (const port of additionalPorts) {
      try {
        // HTTP
        const httpHeaders = await this.getHttpHeaders(`http://${ipAddress}:${port}`);
        if (httpHeaders) {
          results[`http_${port}`] = httpHeaders;
        }
      } catch (error) {
        // Bỏ qua lỗi
      }
      
      try {
        // HTTPS
        const httpsHeaders = await this.getHttpHeaders(`https://${ipAddress}:${port}`);
        if (httpsHeaders) {
          results[`https_${port}`] = httpsHeaders;
        }
      } catch (error) {
        // Bỏ qua lỗi
      }
    }
    
    return Object.keys(results).length > 0 ? results : undefined;
  }

  /**
   * Lấy HTTP headers từ URL
   * @param url URL cần lấy headers
   * @returns Headers hoặc undefined nếu không lấy được
   */
  private getHttpHeaders(url: string): Promise<Record<string, string> | undefined> {
    return new Promise((resolve, reject) => {
      const isHttps = url.startsWith('https:');
      const lib = isHttps ? https : http;
      
      const req = lib.get(url, {
        timeout: 5000,
        rejectUnauthorized: false, // Bỏ qua lỗi certificate
        headers: {
          'User-Agent': 'MMCS-Probe/1.0'
        }
      }, (res) => {
        const headers = res.headers as Record<string, string>;
        resolve(headers);
        
        // Xả dữ liệu để kết thúc request
        res.on('data', () => {});
        res.on('end', () => {});
      });
      
      req.on('error', (error) => {
        reject(error);
      });
      
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Connection timeout'));
      });
      
      // Đảm bảo request kết thúc
      setTimeout(() => {
        req.destroy();
        reject(new Error('Forced timeout'));
      }, 6000);
    });
  }

  /**
   * Quét cổng mở trên thiết bị
   * @param ipAddress Địa chỉ IP của thiết bị
   * @returns Thông tin về các cổng đang mở
   */
  private async scanPorts(ipAddress: string): Promise<{ openPorts: number[] } | undefined> {
    try {
      // Quét các cổng phổ biến
      const commonPorts = [
        21, 22, 23, 25, 53, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90,
        443, 445, 8080, 8081, 8082, 8443, 8000, 8888, 9000, 9090, 3389
      ].join(',');
      
      const { stdout } = await execPromise(
        `nmap -p ${commonPorts} --open ${ipAddress} -T4 -n | grep ^[0-9]`,
        { timeout: 30000 }
      );
      
      // Parse kết quả
      const openPorts: number[] = [];
      const lines = stdout.split('\n');
      
      for (const line of lines) {
        if (line.trim() === '') continue;
        
        const match = line.match(/^(\d+)\/\w+\s+open/);
        if (match) {
          openPorts.push(parseInt(match[1], 10));
        }
      }
      
      return { openPorts };
    } catch (error) {
      console.error(`Port scan error for ${ipAddress}:`, error);
      return undefined;
    }
  }

  /**
   * Lấy thông tin LLDP/CDP neighbors từ MikroTik router
   * @param deviceId ID của thiết bị MikroTik
   * @param targetIp Địa chỉ IP mục tiêu (có thể là undefined để lấy tất cả neighbors)
   * @returns Thông tin LLDP/CDP neighbors
   */
  private async getLLDPNeighborsFromMikrotik(deviceId: number, targetIp?: string): Promise<any[]> {
    try {
      const device = await storage.getDevice(deviceId);
      if (!device) {
        throw new Error(`Device with ID ${deviceId} not found`);
      }
      
      // Kết nối tới thiết bị MikroTik
      await mikrotikService.connect({
        id: device.id,
        host: device.ipAddress,
        username: device.username,
        password: device.password
      });

      // Lấy LLDP neighbors
      const lldpNeighbors = await mikrotikService.sendCommand(deviceId, '/ip/neighbor/print');
      
      // Đóng kết nối
      await mikrotikService.disconnect(deviceId);
      
      // Lọc kết quả theo IP mục tiêu nếu có
      if (targetIp) {
        return lldpNeighbors.filter((neighbor: any) => 
          neighbor['ip-address'] === targetIp || neighbor.address === targetIp
        );
      }
      
      return lldpNeighbors;
    } catch (error) {
      console.error(`Error getting LLDP neighbors from device ID ${deviceId}:`, error);
      return [];
    }
  }

  /**
   * Xác định loại thiết bị dựa trên dữ liệu đã thu thập
   * @param deviceData Dữ liệu thiết bị
   * @returns Loại thiết bị
   */
  private determineDeviceType(deviceData: Record<string, any>): string | undefined {
    // Mặc định là không xác định
    let deviceType: string | undefined = undefined;
    
    // Kiểm tra từ dữ liệu SNMP
    if (deviceData.snmp?.sysDescr) {
      const sysDescr = deviceData.snmp.sysDescr.toLowerCase();
      
      if (sysDescr.includes('mikrotik') || sysDescr.includes('routeros')) {
        deviceType = 'router';
      } else if (sysDescr.includes('cisco') && sysDescr.includes('nx-os')) {
        deviceType = 'switch';
      } else if (sysDescr.includes('linux')) {
        deviceType = 'server';
      } else if (sysDescr.includes('windows')) {
        deviceType = 'workstation';
      } else if (sysDescr.includes('printer') || sysDescr.includes('hp laserjet')) {
        deviceType = 'printer';
      } else if (sysDescr.includes('camera') || sysDescr.includes('nvr') || sysDescr.includes('hikvision')) {
        deviceType = 'camera';
      }
    }
    
    // Kiểm tra từ thông tin cổng
    if (!deviceType && deviceData.ports?.openPorts) {
      const ports = deviceData.ports.openPorts;
      
      if (ports.includes(80) || ports.includes(443)) {
        // Có web server
        if (ports.includes(25) || ports.includes(143) || ports.includes(110)) {
          deviceType = 'mail_server';
        } else if (ports.includes(21) || ports.includes(22)) {
          deviceType = 'server';
        } else {
          deviceType = 'web_server';
        }
      } else if (ports.includes(3389)) {
        deviceType = 'windows';
      } else if (ports.includes(22)) {
        deviceType = 'linux';
      } else if (ports.includes(53)) {
        deviceType = 'dns_server';
      } else if (ports.includes(23)) {
        deviceType = 'network_device';
      } else if (ports.includes(9100)) {
        deviceType = 'printer';
      }
    }
    
    // Kiểm tra từ thông tin nhà cung cấp (vendor)
    if (!deviceType && deviceData.vendor) {
      const vendor = deviceData.vendor.toLowerCase();
      
      if (vendor.includes('cisco')) {
        deviceType = 'cisco_device';
      } else if (vendor.includes('mikrotik')) {
        deviceType = 'mikrotik';
      } else if (vendor.includes('huawei')) {
        deviceType = 'huawei_device';
      } else if (vendor.includes('hp') || vendor.includes('hewlett')) {
        deviceType = 'hp_device';
      } else if (vendor.includes('dell')) {
        deviceType = 'dell_device';
      } else if (vendor.includes('apple')) {
        deviceType = 'apple_device';
      } else if (vendor.includes('samsung')) {
        deviceType = 'samsung_device';
      } else if (vendor.includes('hikvision')) {
        deviceType = 'surveillance_camera';
      } else if (vendor.includes('dahua')) {
        deviceType = 'surveillance_camera';
      }
    }
    
    return deviceType;
  }
}

// Xuất một thể hiện duy nhất của service nhận diện thiết bị
export const deviceIdentificationService = new DeviceIdentificationService();