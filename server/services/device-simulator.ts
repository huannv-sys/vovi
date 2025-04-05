import { storage } from "../storage";
import type { Device, InsertMetric, InsertInterface } from "@shared/schema";

// Constants for simulation
const MIN_CPU_LOAD = 10;
const MAX_CPU_LOAD = 85;
const MIN_MEMORY_USAGE = 40000000; // ~40MB
const MAX_MEMORY_USAGE = 80000000; // ~80MB
const TEMPERATURE_BASE = 45;
const TEMPERATURE_VARIANCE = 5;

/**
 * DeviceSimulatorService - Provides simulated device data when real connection is not available
 * This is useful for development, testing, and demonstration purposes
 */
export class DeviceSimulatorService {
  private simulationEnabled: boolean = false;
  
  /**
   * Enable or disable simulation mode
   */
  setSimulationMode(enabled: boolean): void {
    this.simulationEnabled = enabled;
    console.log(`Device simulation mode ${enabled ? 'enabled' : 'disabled'}`);
  }
  
  /**
   * Check if simulation mode is enabled
   */
  isSimulationEnabled(): boolean {
    return this.simulationEnabled;
  }
  
  /**
   * Generate simulated metrics for a device
   */
  async generateSimulatedMetrics(deviceId: number): Promise<boolean> {
    if (!this.simulationEnabled) {
      return false;
    }
    
    try {
      const device = await storage.getDevice(deviceId);
      if (!device) {
        console.error(`Device with ID ${deviceId} not found`);
        return false;
      }
      
      // Create simulated metric
      const metric: InsertMetric = {
        deviceId,
        timestamp: new Date(),
        cpuLoad: this.getRandomInt(MIN_CPU_LOAD, MAX_CPU_LOAD),
        memoryUsage: this.getRandomInt(MIN_MEMORY_USAGE, MAX_MEMORY_USAGE),
        uptime: this.incrementUptime(device.uptime || "0d 0h 0m"),
        temperature: TEMPERATURE_BASE + this.getRandomInt(-TEMPERATURE_VARIANCE, TEMPERATURE_VARIANCE),
        totalMemory: 134217728, // 128MB (typical for MikroTik hAP)
        downloadBandwidth: this.getRandomInt(10000000, 100000000), // 10-100 Mbps
        uploadBandwidth: this.getRandomInt(1000000, 10000000),     // 1-10 Mbps
        boardTemp: TEMPERATURE_BASE + this.getRandomInt(-TEMPERATURE_VARIANCE, TEMPERATURE_VARIANCE),
      };
      
      await storage.createMetric(metric);
      
      // Update device status
      await storage.updateDevice(deviceId, {
        isOnline: true,
        lastSeen: new Date(),
        uptime: metric.uptime,
        model: device.model || "hAP ac",
        serialNumber: device.serialNumber || `SIM${deviceId}${Date.now().toString().slice(-8)}`,
        routerOsVersion: device.routerOsVersion || "6.45.9 (long-term)",
        firmware: device.firmware || "qca9550L",
        cpu: metric.cpuLoad?.toString(),
        totalMemory: metric.totalMemory?.toString(),
        hasWireless: true,
        hasCAPsMAN: false,
      });
      
      // Generate simulated interfaces if needed
      await this.generateSimulatedInterfaces(deviceId);
      
      return true;
    } catch (error) {
      console.error(`Error generating simulated metrics for device ${deviceId}:`, error);
      return false;
    }
  }
  
  /**
   * Generate simulated network interfaces for a device
   */
  private async generateSimulatedInterfaces(deviceId: number): Promise<void> {
    try {
      // Check if interfaces already exist
      const existingInterfaces = await storage.getInterfaces(deviceId);
      
      if (existingInterfaces.length === 0) {
        // Standard interfaces for a typical MikroTik router
        const interfaceTemplates = [
          { name: "ether1", type: "ether", macAddress: "AA:BB:CC:DD:EE:01", running: true },
          { name: "ether2", type: "ether", macAddress: "AA:BB:CC:DD:EE:02", running: true },
          { name: "ether3", type: "ether", macAddress: "AA:BB:CC:DD:EE:03", running: true },
          { name: "ether4", type: "ether", macAddress: "AA:BB:CC:DD:EE:04", running: false },
          { name: "ether5", type: "ether", macAddress: "AA:BB:CC:DD:EE:05", running: true },
          { name: "wlan1", type: "wlan", macAddress: "AA:BB:CC:DD:EE:06", running: true },
          { name: "wlan2", type: "wlan", macAddress: "AA:BB:CC:DD:EE:07", running: false },
          { name: "bridge1", type: "bridge", macAddress: "AA:BB:CC:DD:EE:08", running: true },
        ];
        
        for (const template of interfaceTemplates) {
          const interfaceData: InsertInterface = {
            deviceId,
            name: template.name,
            type: template.type,
            macAddress: template.macAddress,
            running: template.running,
            disabled: !template.running,
            mtu: 1500,
            txBytes: this.getRandomInt(1000000, 100000000),
            rxBytes: this.getRandomInt(1000000, 100000000),
            txPackets: this.getRandomInt(1000, 10000),
            rxPackets: this.getRandomInt(1000, 10000),
            lastLinkUpTime: new Date().toISOString(),
          };
          
          await storage.createInterface(interfaceData);
        }
      } else {
        // Update existing interfaces with new simulated data
        for (const iface of existingInterfaces) {
          // Only update interfaces that are running
          if (iface.running) {
            // Calculate new tx/rx values with some random increment
            const newTxBytes = (iface.txBytes || 0) + this.getRandomInt(10000, 1000000);
            const newRxBytes = (iface.rxBytes || 0) + this.getRandomInt(10000, 1000000);
            
            await storage.updateInterface(iface.id, {
              txBytes: newTxBytes,
              rxBytes: newRxBytes,
              txPackets: (iface.txPackets || 0) + this.getRandomInt(10, 100),
              rxPackets: (iface.rxPackets || 0) + this.getRandomInt(10, 100),
              lastUpdated: new Date(),
            });
          }
        }
      }
    } catch (error) {
      console.error(`Error generating simulated interfaces for device ${deviceId}:`, error);
    }
  }
  
  /**
   * Generate a random integer between min and max (inclusive)
   */
  private getRandomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  
  /**
   * Increment the uptime string
   * Format: "Xd Yh Zm" (days, hours, minutes)
   */
  private incrementUptime(uptime: string): string {
    try {
      // Parse current uptime
      const regex = /(\d+)d\s+(\d+)h\s+(\d+)m/;
      const match = uptime.match(regex);
      
      if (!match) {
        return "0d 1h 0m"; // Default if parsing fails
      }
      
      let days = parseInt(match[1], 10);
      let hours = parseInt(match[2], 10);
      let minutes = parseInt(match[3], 10);
      
      // Add 5 minutes
      minutes += 5;
      
      // Handle overflow
      if (minutes >= 60) {
        hours += Math.floor(minutes / 60);
        minutes %= 60;
      }
      
      if (hours >= 24) {
        days += Math.floor(hours / 24);
        hours %= 24;
      }
      
      return `${days}d ${hours}h ${minutes}m`;
    } catch (error) {
      console.error("Error incrementing uptime:", error);
      return uptime;
    }
  }
}

export const deviceSimulatorService = new DeviceSimulatorService();