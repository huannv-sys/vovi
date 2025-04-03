import { mikrotikService } from "./mikrotik";
import { storage } from "../storage";

class SchedulerService {
  private intervalId?: NodeJS.Timeout;
  private pollingInterval: number = 10000; // 10 seconds - increased frequency for real-time updates

  start() {
    if (this.intervalId) {
      return;
    }

    console.log(`Starting device polling scheduler (interval: ${this.pollingInterval}ms)`);
    this.intervalId = setInterval(this.pollDevices.bind(this), this.pollingInterval);
    
    // Poll devices immediately on start
    this.pollDevices();
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
      console.log("Stopped device polling scheduler");
    }
  }

  setPollingInterval(milliseconds: number) {
    if (milliseconds < 5000) {
      console.warn("Polling interval cannot be less than 5 seconds");
      milliseconds = 5000;
    }
    
    this.pollingInterval = milliseconds;
    
    // Restart polling with new interval if already running
    if (this.intervalId) {
      this.stop();
      this.start();
    }
    
    console.log(`Updated polling interval to ${milliseconds}ms`);
  }

  async pollDevices() {
    try {
      // Get all devices
      const devices = await storage.getAllDevices();
      console.log(`Polling ${devices.length} devices...`);
      
      // Process each device
      for (const device of devices) {
        try {
          await mikrotikService.collectDeviceMetrics(device.id);
        } catch (error) {
          console.error(`Error polling device ${device.id} (${device.name}):`, error);
        }
      }
    } catch (error) {
      console.error("Error in device polling:", error);
    }
  }
}

export const schedulerService = new SchedulerService();
