import { NetworkDevice, InsertNetworkDevice, MacVendor, InsertMacVendor, DeviceDiscoveryLog, InsertDeviceDiscoveryLog } from "@shared/schema";
import { storage } from "../storage";
import { mikrotikService } from "./mikrotik";
import { exec } from "child_process";
import { promisify } from "util";
import * as dns from "dns";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from 'url';
import { db } from "../db";
import { eq, or, and, sql } from "drizzle-orm";
import { networkDevices, macVendors, deviceDiscoveryLog, devices } from "@shared/schema";

// Lấy đường dẫn hiện tại từ ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const execPromise = promisify(exec);
const dnsReverse = promisify(dns.reverse);
const dnsLookup = promisify(dns.lookup);

/**
 * Service phát hiện thiết bị trên mạng
 */
export class DeviceDiscoveryService {
  private static OUI_DB_PATH = path.join(__dirname, '../../assets/oui-database.json');
  private ouiDatabase: Record<string, string> = {};
  private isOuiDatabaseLoaded = false;

  constructor() {
    // Khởi tạo OUI database nếu có thể
    this.loadOuiDatabase();
  }

  /**
   * Tải dữ liệu OUI (MAC vendor) từ file JSON hoặc database
   */
  private async loadOuiDatabase() {
    try {
      // Đầu tiên, tìm kiếm trong database
      const vendors = await db.select().from(macVendors);
      if (vendors.length > 0) {
        for (const vendor of vendors) {
          this.ouiDatabase[vendor.oui.toLowerCase()] = vendor.vendor;
        }
        this.isOuiDatabaseLoaded = true;
        console.log(`Loaded ${Object.keys(this.ouiDatabase).length} OUI entries from database`);
        return;
      }

      // Nếu không có trong database, thử tải từ file
      if (fs.existsSync(DeviceDiscoveryService.OUI_DB_PATH)) {
        const data = fs.readFileSync(DeviceDiscoveryService.OUI_DB_PATH, 'utf8');
        this.ouiDatabase = JSON.parse(data);
        this.isOuiDatabaseLoaded = true;
        console.log(`Loaded ${Object.keys(this.ouiDatabase).length} OUI entries from file`);
        
        // Đồng bộ dữ liệu vào database
        await this.syncOuiToDatabase();
      } else {
        console.log('OUI database file not found. Will use online lookup.');
      }
    } catch (error) {
      console.error('Error loading OUI database:', error);
    }
  }

  /**
   * Đồng bộ OUI database vào PostgreSQL
   */
  private async syncOuiToDatabase() {
    try {
      const entries = Object.entries(this.ouiDatabase);
      console.log(`Syncing ${entries.length} OUI entries to database...`);
      
      // Xử lý theo lô để tránh quá tải database
      const batchSize = 1000;
      for (let i = 0; i < entries.length; i += batchSize) {
        const batch = entries.slice(i, i + batchSize);
        const values = batch.map(([oui, vendor]) => ({
          oui: oui.toLowerCase(),
          vendor
        }));
        
        // Nếu không có giá trị nào thì bỏ qua
        if (values.length === 0) continue;
        
        // Sử dụng onConflictDoNothing thay vì onConflictDoUpdate
        await db.insert(macVendors).values(values).onConflictDoNothing();
      }
      console.log('OUI database sync completed');
    } catch (error) {
      console.error('Error syncing OUI database to PostgreSQL:', error);
    }
  }

  /**
   * Cập nhật OUI database từ IEEE
   */
  public async updateOuiDatabase() {
    try {
      console.log('Downloading latest OUI database from IEEE...');
      // Sử dụng API hoặc tải file từ IEEE 
      const { stdout } = await execPromise(
        "curl -s 'https://standards-oui.ieee.org/oui/oui.txt' | grep '(hex)' | sed 's/^\\(.*\\) (hex)\\(.*\\)/\\1\\2/' | awk '{print $1 \" \" substr($0, index($0,$2))}'", 
        { maxBuffer: 10 * 1024 * 1024 } // 10MB buffer
      );
      
      const newOuiDb: Record<string, string> = {};
      const lines = stdout.split('\n');
      
      for (const line of lines) {
        if (line.trim().length === 0) continue;
        
        const parts = line.trim().match(/^([0-9A-F]{6})\s+(.+)$/);
        if (parts && parts.length >= 3) {
          const [_, oui, vendor] = parts;
          newOuiDb[oui.toLowerCase()] = vendor.trim();
        }
      }
      
      // Lưu vào file
      const dirPath = path.dirname(DeviceDiscoveryService.OUI_DB_PATH);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
      
      fs.writeFileSync(
        DeviceDiscoveryService.OUI_DB_PATH, 
        JSON.stringify(newOuiDb, null, 2)
      );
      
      // Cập nhật database trong memory
      this.ouiDatabase = newOuiDb;
      this.isOuiDatabaseLoaded = true;
      
      // Đồng bộ vào database SQL
      await this.syncOuiToDatabase();
      
      console.log(`OUI database updated with ${Object.keys(newOuiDb).length} entries`);
      return true;
    } catch (error) {
      console.error('Error updating OUI database:', error);
      return false;
    }
  }
  
  /**
   * Tra cứu hãng sản xuất dựa trên MAC address
   * @param macAddress MAC address cần tra cứu
   * @returns Tên hãng sản xuất hoặc undefined nếu không tìm thấy
   */
  public async lookupVendor(macAddress: string): Promise<string | undefined> {
    if (!macAddress) return undefined;
    
    // Chuẩn hóa MAC address
    const normalizedMac = macAddress.replace(/[^a-fA-F0-9]/g, '').toLowerCase();
    if (normalizedMac.length < 6) return undefined;
    
    // Lấy OUI (3 byte đầu tiên)
    const oui = normalizedMac.substring(0, 6);
    
    // Tìm trong database lưu trong bộ nhớ
    if (this.isOuiDatabaseLoaded && this.ouiDatabase[oui]) {
      return this.ouiDatabase[oui];
    }
    
    // Nếu không tìm thấy trong bộ nhớ, tìm trong database SQL
    try {
      const [vendorRecord] = await db.select().from(macVendors).where(eq(macVendors.oui, oui));
      if (vendorRecord) {
        // Cập nhật cache
        this.ouiDatabase[oui] = vendorRecord.vendor;
        return vendorRecord.vendor;
      }
    } catch (error) {
      console.error('Error looking up vendor in database:', error);
    }
    
    // Nếu cũng không có trong database, có thể sử dụng API online
    try {
      const { stdout } = await execPromise(`curl -s "https://api.macvendors.com/${encodeURIComponent(macAddress)}"`);
      if (stdout && !stdout.includes('errors') && !stdout.includes('Not Found')) {
        const vendor = stdout.trim();
        
        // Lưu vào database để sử dụng sau này
        await db.insert(macVendors).values({
          oui,
          vendor
        }).onConflictDoNothing();
        
        // Cập nhật cache
        this.ouiDatabase[oui] = vendor;
        
        return vendor;
      }
    } catch (error) {
      console.error('Error looking up vendor online:', error);
    }
    
    return undefined;
  }

  /**
   * Lấy thông tin thiết bị mạng từ DNS (reverse lookup)
   * @param ipAddress Địa chỉ IP cần tra cứu
   * @returns Hostname của thiết bị
   */
  public async getDnsName(ipAddress: string): Promise<string | undefined> {
    try {
      const hostnames = await dnsReverse(ipAddress);
      return hostnames.length > 0 ? hostnames[0] : undefined;
    } catch (error) {
      // Không tìm thấy DNS entry
      return undefined;
    }
  }

  /**
   * Phát hiện và lưu thông tin thiết bị mới
   * @param ipAddress Địa chỉ IP của thiết bị
   * @param macAddress Địa chỉ MAC của thiết bị
   * @param method Phương thức phát hiện ('arp', 'dhcp', 'snmp', 'scan', etc.)
   * @param sourceIp Địa chỉ IP nguồn phát hiện thiết bị (ví dụ: router)
   * @param additionalData Dữ liệu bổ sung
   * @returns Thiết bị được tạo hoặc cập nhật
   */
  public async detectDevice(
    ipAddress: string, 
    macAddress: string, 
    method: string, 
    sourceIp?: string,
    additionalData?: any
  ): Promise<NetworkDevice> {
    // Chuẩn hóa MAC address
    const normalizedMac = macAddress.toLowerCase().replace(/[^a-f0-9]/g, '');
    // Format lại MAC address
    const formattedMac = normalizedMac.match(/.{1,2}/g)?.join(':') || macAddress;
    
    // Tìm thiết bị trong database
    let [existingDevice] = await db.select()
      .from(networkDevices)
      .where(
        or(
          eq(networkDevices.ipAddress, ipAddress),
          eq(networkDevices.macAddress, formattedMac)
        )
      );
    
    let deviceData = additionalData || {};
    let isIdentified = false;
    let identificationScore = 0;
    
    // Lấy thông tin vendor từ MAC address
    const vendor = await this.lookupVendor(formattedMac);
    if (vendor) {
      deviceData.vendor = vendor;
      isIdentified = true;
      identificationScore += 20; // Tăng điểm nhận diện khi có vendor
    }
    
    // Lấy hostname từ DNS
    const hostname = await this.getDnsName(ipAddress);
    if (hostname) {
      deviceData.hostname = hostname;
      isIdentified = true;
      identificationScore += 30; // Tăng điểm nhận diện khi có hostname
    }
    
    // Nếu thiết bị đã tồn tại, cập nhật thông tin
    let device: NetworkDevice;
    if (existingDevice) {
      // Merge deviceData
      const mergedData = {
        ...existingDevice.deviceData as Record<string, any>,
        ...deviceData
      };

      // Cập nhật thông tin
      await db.update(networkDevices)
        .set({
          ipAddress, // Cập nhật IP mới nếu đã thay đổi
          vendor: vendor || existingDevice.vendor,
          hostname: hostname || existingDevice.hostname,
          lastSeen: new Date(),
          isIdentified: isIdentified || existingDevice.isIdentified,
          identificationScore: Math.max(identificationScore, existingDevice.identificationScore || 0),
          deviceData: mergedData,
          lastUpdateMethod: method
        })
        .where(eq(networkDevices.id, existingDevice.id));
      
      // Lấy thiết bị đã cập nhật
      [device] = await db.select()
        .from(networkDevices)
        .where(eq(networkDevices.id, existingDevice.id));
    } else {
      // Tạo thiết bị mới
      const [newDevice] = await db.insert(networkDevices)
        .values({
          ipAddress,
          macAddress: formattedMac,
          vendor,
          hostname,
          isIdentified,
          identificationScore,
          deviceData,
          lastUpdateMethod: method
        })
        .returning();
      
      device = newDevice;
    }
    
    // Lưu log phát hiện
    await db.insert(deviceDiscoveryLog)
      .values({
        deviceId: device.id,
        method,
        sourceIp,
        details: additionalData
      });
    
    return device;
  }

  /**
   * Quét thiết bị trên mạng bằng ARP hoặc phương pháp thay thế
   * @param subnet Subnet cần quét (ví dụ: 192.168.1.0/24)
   * @returns Danh sách thiết bị được phát hiện
   */
  public async scanNetworkByArp(subnet?: string): Promise<NetworkDevice[]> {
    try {
      const devices: NetworkDevice[] = [];
      
      // Sử dụng nmap để quét mạng (một phương pháp thay thế cho arp)
      try {
        // Thử dùng nmap nếu có
        let nmapCmd = subnet ? `nmap -sn ${subnet}` : 'nmap -sn 192.168.1.0/24';
        
        const { stdout: nmapResult } = await execPromise(nmapCmd).catch(() => {
          // Nếu không có nmap, thử với phương pháp khác
          return { stdout: '' };
        });
        
        if (nmapResult) {
          const hosts = nmapResult.match(/Nmap scan report for ([^\s]+)\s+\(([0-9.]+)\)/g);
          if (hosts) {
            for (const host of hosts) {
              const ipMatch = host.match(/\(([0-9.]+)\)/);
              if (ipMatch && ipMatch[1]) {
                const ipAddress = ipMatch[1];
                
                // Có thể không có MAC từ nmap -sn, tạo một bản ghi với IP và cập nhật sau
                const device = await this.detectDevice(
                  ipAddress,
                  '', // MAC address không có 
                  'nmap',
                  undefined,
                  { source: 'nmap_scan' }
                );
                
                devices.push(device);
              }
            }
          }
          
          // Nếu tìm thấy thiết bị với nmap, trả về kết quả
          if (devices.length > 0) {
            return devices;
          }
        }
      } catch (nmapError) {
        console.log('Nmap scan failed, trying alternative methods:', nmapError);
      }
      
      // Nếu nmap không hoạt động, thử phương pháp ping sweep
      try {
        const targetSubnet = subnet || '192.168.1';
        const pingPromises = [];
        
        // Ping sweep (192.168.1.1 - 192.168.1.254)
        for (let i = 1; i < 255; i++) {
          const ip = `${targetSubnet.split('/')[0].split('.').slice(0, 3).join('.')}.${i}`;
          pingPromises.push(
            execPromise(`ping -c 1 -W 1 ${ip}`)
              .then(() => ip)
              .catch(() => null)
          );
        }
        
        const results = await Promise.all(pingPromises);
        const activeIps = results.filter(ip => ip !== null);
        
        // Tạo thiết bị cho mỗi IP phản hồi
        for (const ip of activeIps) {
          if (ip) {
            const device = await this.detectDevice(
              ip,
              '', // Không có MAC
              'ping',
              undefined,
              { source: 'ping_sweep' }
            );
            
            devices.push(device);
          }
        }
      } catch (pingError) {
        console.error('Ping sweep failed:', pingError);
      }
      
      // Thử arp nếu các phương pháp khác thất bại
      try {
        let cmd = 'arp -a';
        if (subnet) {
          cmd = `ping -c 1 -b ${subnet.replace('/24', '.255')} > /dev/null && arp -a`;
        }
        
        const { stdout } = await execPromise(cmd);
        
        // Parse kết quả từ arp
        const lines = stdout.split('\n');
        for (const line of lines) {
          // Format kết quả từ "hostname (192.168.1.1) at aa:bb:cc:dd:ee:ff [ether] on interface"
          const match = line.match(/\(([0-9.]+)\) at ([a-fA-F0-9:]+) \[(\w+)\]/);
          if (match) {
            const ipAddress = match[1];
            const macAddress = match[2];
            const type = match[3]; // ether, etc.
            
            // Bỏ qua địa chỉ đặc biệt
            if (macAddress === '00:00:00:00:00:00' || macAddress === 'ff:ff:ff:ff:ff:ff') {
              continue;
            }
            
            // Phát hiện thiết bị
            const device = await this.detectDevice(
              ipAddress, 
              macAddress, 
              'arp', 
              undefined, 
              { type, source: 'arp_scan' }
            );
            
            devices.push(device);
          }
        }
      } catch (arpError) {
        console.log('ARP scan failed:', arpError);
      }
      
      // Nếu không tìm thấy thiết bị nào và có thiết bị trong database, đề xuất sử dụng quét DHCP
      if (devices.length === 0) {
        console.log('No devices found by network scan. Recommend using DHCP discovery instead.');
        
        try {
          // Tìm thấy thiết bị MikroTik để quét DHCP
          const result = await db.execute(sql`SELECT * FROM devices LIMIT 5`);
          const mikrotikDevices = result.rows || [];
          
          if (mikrotikDevices.length > 0) {
            console.log(`Found ${mikrotikDevices.length} MikroTik devices for DHCP scanning.`);
            
            // Không tự động quét DHCP, chỉ ghi log
            console.log('Will try DHCP discovery on next scheduled cycle.');
          }
        } catch (dbError) {
          console.error('Error querying devices table:', dbError);
        }
      }
      
      return devices;
    } catch (error) {
      console.error('Error scanning network:', error);
      return [];
    }
  }

  /**
   * Phát hiện thiết bị từ bảng DHCP của MikroTik
   * @param deviceId ID thiết bị MikroTik trong hệ thống
   * @returns Danh sách thiết bị được phát hiện
   */
  public async detectDevicesFromMikrotikDHCP(deviceId: number): Promise<NetworkDevice[]> {
    try {
      const mikrotikDevice = await storage.getDevice(deviceId);
      if (!mikrotikDevice) {
        throw new Error(`Device with ID ${deviceId} not found`);
      }
      
      // Tạo kết nối MikroTik
      await mikrotikService.connect({
        id: mikrotikDevice.id,
        host: mikrotikDevice.ipAddress,
        username: mikrotikDevice.username,
        password: mikrotikDevice.password
      });
      
      // Lấy danh sách DHCP leases
      const dhcpLeases = await mikrotikService.sendCommand(deviceId, '/ip/dhcp-server/lease/print');
      const devices: NetworkDevice[] = [];
      
      for (const lease of dhcpLeases) {
        if (lease['mac-address'] && lease.address) {
          const ipAddress = lease.address;
          const macAddress = lease['mac-address'];
          const hostname = lease.host || undefined;
          
          // Phát hiện thiết bị
          const detectedDevice = await this.detectDevice(
            ipAddress, 
            macAddress, 
            'dhcp', 
            mikrotikDevice.ipAddress, // Router IP
            { 
              hostname, 
              clientId: lease['client-id'], 
              status: lease.status,
              comment: lease.comment,
              expiresAfter: lease['expires-after'],
              source: 'mikrotik_dhcp'
            }
          );
          
          devices.push(detectedDevice);
        }
      }
      
      return devices;
    } catch (error) {
      console.error(`Error detecting devices from MikroTik DHCP (Device ID: ${deviceId}):`, error);
      return [];
    } finally {
      // Đóng kết nối
      await mikrotikService.disconnect(deviceId);
    }
  }

  /**
   * Lấy danh sách thiết bị mạng đã phát hiện
   * @param filter Bộ lọc tùy chọn
   * @returns Danh sách thiết bị
   */
  public async getNetworkDevices(filter?: {
    isIdentified?: boolean;
    vendor?: string;
    minIdentificationScore?: number;
  }): Promise<NetworkDevice[]> {
    try {
      let query = db.select().from(networkDevices);
      
      // Áp dụng bộ lọc nếu có
      if (filter) {
        const conditions = [];
        
        if (filter.isIdentified !== undefined) {
          conditions.push(eq(networkDevices.isIdentified, filter.isIdentified));
        }
        
        if (filter.vendor !== undefined) {
          conditions.push(eq(networkDevices.vendor, filter.vendor));
        }
        
        if (filter.minIdentificationScore !== undefined) {
          conditions.push(sql`${networkDevices.identificationScore} >= ${filter.minIdentificationScore}`);
        }
        
        if (conditions.length > 0) {
          query = query.where(and(...conditions));
        }
      }
      
      return await query;
    } catch (error) {
      console.error('Error getting network devices:', error);
      return [];
    }
  }

  /**
   * Lấy lịch sử phát hiện thiết bị
   * @param deviceId ID của thiết bị mạng
   * @param limit Giới hạn số lượng kết quả
   * @returns Lịch sử phát hiện
   */
  public async getDeviceDiscoveryHistory(deviceId: number, limit = 100): Promise<DeviceDiscoveryLog[]> {
    try {
      return await db.select()
        .from(deviceDiscoveryLog)
        .where(eq(deviceDiscoveryLog.deviceId, deviceId))
        .orderBy(sql`${deviceDiscoveryLog.timestamp} DESC`)
        .limit(limit);
    } catch (error) {
      console.error(`Error getting discovery history for device ID ${deviceId}:`, error);
      return [];
    }
  }
}

// Xuất một thể hiện duy nhất của service phát hiện thiết bị
export const deviceDiscoveryService = new DeviceDiscoveryService();