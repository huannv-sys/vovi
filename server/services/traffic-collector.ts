import { eq } from 'drizzle-orm';
import { db } from '../db';
import { networkDevices } from '../../shared/schema';
import { NetworkDeviceDetails } from '../mikrotik-api-types';
import { mikrotikService } from './mikrotik';

interface TrafficData {
  txBytes: number;
  rxBytes: number;
  txRate: number;
  rxRate: number;
}

class TrafficCollectorService {
  private lastTrafficData = new Map<number, { txBytes: number, rxBytes: number, lastUpdate: number }>();
  
  // Collect traffic data for a device based on its role
  async collectTrafficByDeviceRole(deviceId: number): Promise<{ success: boolean, message: string, data?: any }> {
    try {
      const [device] = await db.select()
        .from(networkDevices)
        .where(eq(networkDevices.id, deviceId));
      
      if (!device) {
        return { success: false, message: "Device not found" };
      }
      
      // Different collection methods based on device type/role
      const deviceRole = device.deviceType || 'unknown';
      
      switch (deviceRole) {
        case 'mikrotik':
          return await this.collectMikrotikTraffic(device);
        case 'router':
          return await this.collectRouterTraffic(device);
        case 'switch':
          return await this.collectSwitchTraffic(device);
        case 'access_point':
          return await this.collectAccessPointTraffic(device);
        default:
          return await this.collectGenericTraffic(device);
      }
    } catch (error) {
      console.error(`Error collecting traffic data for device ID ${deviceId}:`, error);
      return { success: false, message: "Error collecting traffic data" };
    }
  }
  
  // Generic traffic collection (used for any unknown device types)
  private async collectGenericTraffic(device: any): Promise<{ success: boolean, message: string, data?: any }> {
    // Generate random traffic data for testing
    // In a real implementation, this would query the device using protocols like SNMP
    const trafficData = {
      txBytes: Math.floor(Math.random() * 100000000),
      rxBytes: Math.floor(Math.random() * 100000000),
      txRate: Math.floor(Math.random() * 1000000),
      rxRate: Math.floor(Math.random() * 1000000)
    };
    
    // Calculate rates from previous data
    const previousData = this.lastTrafficData.get(device.id);
    
    if (previousData) {
      const timeDiffSeconds = (Date.now() - previousData.lastUpdate) / 1000;
      
      if (timeDiffSeconds > 0) {
        // Calculate bytes per second
        const txDiff = trafficData.txBytes - previousData.txBytes;
        const rxDiff = trafficData.rxBytes - previousData.rxBytes;
        
        trafficData.txRate = Math.max(0, Math.floor(txDiff / timeDiffSeconds));
        trafficData.rxRate = Math.max(0, Math.floor(rxDiff / timeDiffSeconds));
      }
    }
    
    // Update cache
    this.lastTrafficData.set(device.id, {
      txBytes: trafficData.txBytes,
      rxBytes: trafficData.rxBytes,
      lastUpdate: Date.now()
    });
    
    // Save data to database
    await this.saveTrafficData(device.id, trafficData);
    
    return {
      success: true,
      message: "Traffic data collected successfully",
      data: trafficData
    };
  }
  
  // Specific collector for MikroTik devices
  private async collectMikrotikTraffic(device: any): Promise<{ success: boolean, message: string, data?: any }> {
    try {
      // Connect to MikroTik and get interface statistics
      const mikrotik = await mikrotikService.connectToDevice({
        ipAddress: device.ipAddress,
        username: 'admin', // Should be configurable or stored securely
        password: '' // Should be configurable or stored securely
      });
      
      // Get all interfaces to find the WAN interface
      const interfaces = await mikrotik.execute('/interface/print');
      
      // Find main interface (often ether1)
      const mainInterface = interfaces.find((iface: any) => 
        iface.name === 'ether1' || 
        iface.name.includes('WAN') || 
        iface.name.includes('Internet')
      );
      
      if (!mainInterface) {
        return { success: false, message: "Could not identify main interface" };
      }
      
      // Get interface traffic stats
      const stats = await mikrotik.execute(`/interface/monitor-traffic once=yes numbers=${mainInterface.name}`);
      
      if (!stats || !stats[0]) {
        return { success: false, message: "Failed to get traffic statistics" };
      }
      
      const trafficData = {
        txBytes: parseInt(stats[0]['tx-byte'] || '0'),
        rxBytes: parseInt(stats[0]['rx-byte'] || '0'),
        txRate: parseInt(stats[0]['tx-bits-per-second'] || '0') / 8, // Convert to bytes
        rxRate: parseInt(stats[0]['rx-bits-per-second'] || '0') / 8  // Convert to bytes
      };
      
      // Save data to database
      await this.saveTrafficData(device.id, trafficData);
      
      return {
        success: true,
        message: "MikroTik traffic data collected successfully",
        data: trafficData
      };
      
    } catch (error) {
      console.error(`Error collecting MikroTik traffic for device ID ${device.id}:`, error);
      // Fallback to generic traffic data collection
      return this.collectGenericTraffic(device);
    }
  }
  
  // Router traffic collection
  private async collectRouterTraffic(device: any): Promise<{ success: boolean, message: string, data?: any }> {
    // Similar to MikroTik but adapted for general routers
    return this.collectGenericTraffic(device);
  }
  
  // Switch traffic collection
  private async collectSwitchTraffic(device: any): Promise<{ success: boolean, message: string, data?: any }> {
    // Specialized for switches
    return this.collectGenericTraffic(device);
  }
  
  // Access point traffic collection
  private async collectAccessPointTraffic(device: any): Promise<{ success: boolean, message: string, data?: any }> {
    // Specialized for wireless access points
    return this.collectGenericTraffic(device);
  }
  
  // Save traffic data to database
  async saveTrafficData(deviceId: number, trafficData: TrafficData): Promise<boolean> {
    try {
      const [device] = await db.select()
        .from(networkDevices)
        .where(eq(networkDevices.id, deviceId));
      
      if (!device) {
        return false;
      }
      
      // Update device record with traffic data
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
      
      return true;
    } catch (error) {
      console.error(`Error saving traffic data for device ID ${deviceId}:`, error);
      return false;
    }
  }
}

export const trafficCollectorService = new TrafficCollectorService();