import { eq, and, sql } from 'drizzle-orm';
import { db } from '../db';
import { networkDevices } from '../../shared/schema';
import { NetworkDeviceDetails } from '../mikrotik-api-types';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';

const execAsync = promisify(exec);

class ClientManagementService {
  private ouiDatabasePath = './assets/oui-database.json';
  private ouiDatabase: Record<string, string> | null = null;
  private deviceCache = new Map<number, { lastCheck: Date, isOnline: boolean }>();
  
  constructor() {
    // Load OUI database if it exists
    this.loadOuiDatabase();
  }
  
  private async loadOuiDatabase() {
    try {
      if (fs.existsSync(this.ouiDatabasePath)) {
        const data = fs.readFileSync(this.ouiDatabasePath, 'utf8');
        this.ouiDatabase = JSON.parse(data);
        console.log(`Loaded OUI database with ${Object.keys(this.ouiDatabase).length} entries`);
      } else {
        console.log('OUI database file not found. Vendor lookup will not be available.');
      }
    } catch (error) {
      console.error('Error loading OUI database:', error);
    }
  }
  
  private lookupVendor(macAddress: string): string | null {
    if (!this.ouiDatabase || !macAddress) return null;
    
    // Normalize MAC address format
    const normalizedMac = macAddress.toUpperCase().replace(/[^A-F0-9]/g, '');
    
    // Check first 6 characters (OUI)
    const oui = normalizedMac.substring(0, 6);
    
    return this.ouiDatabase[oui] || null;
  }
  
  // Get all network devices for client monitoring
  async getNetworkDevices(): Promise<any[]> {
    try {
      // Get all devices from the database
      const devices = await db.select().from(networkDevices);
      
      // Check online status for each device and add vendor information
      const devicesWithStatus = devices.map((device) => {
        const cachedStatus = this.deviceCache.get(device.id);
        const isOnline = cachedStatus ? cachedStatus.isOnline : false;
        
        return {
          ...device,
          isOnline,
          vendor: device.macAddress ? this.lookupVendor(device.macAddress) : null
        };
      });
      
      return devicesWithStatus;
    } catch (error) {
      console.error('Error getting network devices:', error);
      return [];
    }
  }
  
  // Check if a device is online
  async checkDeviceStatus(deviceId: number): Promise<any> {
    try {
      // Get device details
      const [device] = await db.select()
        .from(networkDevices)
        .where(eq(networkDevices.id, deviceId));
      
      if (!device) {
        console.error(`Device not found with ID: ${deviceId}`);
        return null;
      }
      
      // Check if device is online
      const isOnline = await this.pingDevice(device.ipAddress);
      
      // Update cache
      this.deviceCache.set(deviceId, {
        lastCheck: new Date(),
        isOnline
      });
      
      // Add vendor info
      const vendor = device.macAddress ? this.lookupVendor(device.macAddress) : null;
      
      // Return device with status
      return {
        ...device,
        isOnline,
        vendor
      };
    } catch (error) {
      console.error(`Error checking device status for ID ${deviceId}:`, error);
      return null;
    }
  }
  
  // Ping a device to check if it's online
  private async pingDevice(ipAddress: string): Promise<boolean> {
    try {
      // Different ping command options based on OS
      const pingCommand = process.platform === 'win32'
        ? `ping -n 1 -w 1000 ${ipAddress}`
        : `ping -c 1 -W 1 ${ipAddress}`;
      
      const { stdout } = await execAsync(pingCommand);
      
      // Check if ping was successful
      return stdout.includes('TTL=') || // Windows
             stdout.includes(' 0% packet loss'); // Linux/Mac
    } catch (error) {
      // If ping command fails, device is offline
      return false;
    }
  }
  
  // Add a discovered device to monitoring
  async addDeviceToMonitoring(device: NetworkDeviceDetails): Promise<any> {
    try {
      // Check if device already exists
      const existingDevices = await db.select()
        .from(networkDevices)
        .where(
          and(
            eq(networkDevices.ipAddress, device.ipAddress),
            eq(networkDevices.macAddress, device.macAddress)
          )
        );
      
      if (existingDevices.length > 0) {
        // Update existing device with new information
        await db.update(networkDevices)
          .set({
            hostName: device.hostName,
            interface: device.interface,
            lastSeen: new Date(),
            // Keep other fields that might have been set previously
          })
          .where(eq(networkDevices.id, existingDevices[0].id));
        
        // Return updated device
        return this.checkDeviceStatus(existingDevices[0].id);
      }
      
      // Insert new device
      const insertResult = await db.insert(networkDevices)
        .values({
          ipAddress: device.ipAddress,
          macAddress: device.macAddress,
          hostName: device.hostName,
          interface: device.interface,
          firstSeen: new Date(),
          lastSeen: new Date(),
          deviceType: device.deviceType || 'unknown',
          deviceData: device.deviceData || {}
        })
        .returning();
      
      if (insertResult.length === 0) {
        throw new Error('Failed to insert device into database');
      }
      
      // Check device status and return with status
      return this.checkDeviceStatus(insertResult[0].id);
    } catch (error) {
      console.error('Error adding device to monitoring:', error);
      return null;
    }
  }
  
  // Refresh all device statuses
  async refreshAllDeviceStatus(): Promise<any[]> {
    try {
      const devices = await db.select().from(networkDevices);
      
      // Check status for all devices in parallel
      const statuses = await Promise.all(
        devices.map(device => this.checkDeviceStatus(device.id))
      );
      
      // Filter out null results
      return statuses.filter(Boolean);
    } catch (error) {
      console.error('Error refreshing all device statuses:', error);
      return [];
    }
  }
  
  // Update device traffic data
  async updateDeviceTraffic(deviceId: number, trafficData: any): Promise<any> {
    try {
      // Get current device
      const [device] = await db.select()
        .from(networkDevices)
        .where(eq(networkDevices.id, deviceId));
      
      if (!device) {
        console.error(`Device not found with ID: ${deviceId}`);
        return null;
      }
      
      // Update device with traffic data
      await db.update(networkDevices)
        .set({
          lastSeen: new Date(),
          deviceData: {
            ...device.deviceData,
            traffic: {
              ...trafficData,
              lastUpdated: new Date().toISOString()
            }
          }
        })
        .where(eq(networkDevices.id, deviceId));
      
      // Return updated device
      return this.checkDeviceStatus(deviceId);
    } catch (error) {
      console.error(`Error updating traffic for device ID ${deviceId}:`, error);
      return null;
    }
  }
  
  // Scan the network for new devices
  async scanNetwork(subnet?: string): Promise<NetworkDeviceDetails[]> {
    try {
      // Define subnet to scan - default to local subnet if not specified
      const networkToScan = subnet || '192.168.1.0/24';
      
      // Use nmap to scan the network
      const cmd = `nmap -sn ${networkToScan} -oG - | grep "Up" | awk '{print $2}'`;
      
      console.log(`Scanning network: ${networkToScan}`);
      const { stdout } = await execAsync(cmd);
      
      // Parse the results - list of IP addresses
      const ipAddresses = stdout.trim().split('\n').filter(Boolean);
      
      if (ipAddresses.length === 0) {
        console.log('No devices found in network scan');
        return [];
      }
      
      console.log(`Found ${ipAddresses.length} devices in network scan`);
      
      // Get MAC addresses for each IP
      const devices: NetworkDeviceDetails[] = [];
      
      for (const ip of ipAddresses) {
        try {
          // Try to get MAC address using ARP
          const arpCmd = `arp -n ${ip} | grep -v Address | awk '{print $3}'`;
          const { stdout: macStdout } = await execAsync(arpCmd);
          
          const macAddress = macStdout.trim();
          
          if (macAddress && macAddress !== '(incomplete)') {
            devices.push({
              ipAddress: ip,
              macAddress,
              hostName: await this.getHostname(ip),
              firstSeen: new Date(),
              lastSeen: new Date()
            });
          }
        } catch (err) {
          // Continue with next IP if this one fails
          console.error(`Error getting MAC for ${ip}:`, err);
        }
      }
      
      return devices;
    } catch (error) {
      console.error('Error scanning network:', error);
      return [];
    }
  }
  
  // Get hostname for an IP address
  private async getHostname(ip: string): Promise<string | undefined> {
    try {
      // Try to get hostname using hostname command
      const cmd = `dig -x ${ip} +short`;
      const { stdout } = await execAsync(cmd);
      
      const hostname = stdout.trim();
      
      if (hostname) {
        // Remove trailing dot if present
        return hostname.endsWith('.') ? hostname.slice(0, -1) : hostname;
      }
      
      return undefined;
    } catch (error) {
      return undefined;
    }
  }
}

export const clientManagementService = new ClientManagementService();
export default clientManagementService;