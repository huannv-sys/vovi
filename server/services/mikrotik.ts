import type { 
  InsertDevice, 
  InsertMetric, 
  InsertInterface, 
  InsertAlert, 
  AlertSeverity, 
  InsertWirelessInterface,
  InsertCapsmanAP
} from "@shared/schema";
import { storage } from "../storage";
import { alertSeverity } from "@shared/schema";

// RouterOS client mock for demo purposes - would use actual routeros-client in production
class RouterOSClient {
  private connected: boolean = false;
  private ipAddress: string;
  private username: string;
  private password: string;
  
  constructor(ipAddress: string, username: string, password: string) {
    this.ipAddress = ipAddress;
    this.username = username;
    this.password = password;
  }

  async connect(): Promise<boolean> {
    try {
      // In production, we would actually try to connect to the device
      // Using RouterOS client: await client.connect()
      console.log(`Connecting to RouterOS device at ${this.ipAddress}`);
      this.connected = true;
      return true;
    } catch (error) {
      console.error(`Failed to connect to RouterOS device at ${this.ipAddress}:`, error);
      this.connected = false;
      return false;
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async executeCommand(command: string): Promise<any> {
    if (!this.connected) {
      throw new Error("Not connected to RouterOS device");
    }
    
    // In production, we would execute the actual command
    // Since this is a mock, we'll return more realistic and synchronized data
    if (command === "/system/resource/print") {
      // Get more realistic fluctuating values with better synchronization
      const currentTime = Date.now();
      const timeOfDay = (currentTime % (24 * 60 * 60 * 1000)) / (24 * 60 * 60 * 1000); // 0-1 representing time of day
      
      // CPU load follows a more realistic pattern based on time of day
      // Morning/evening peaks, lower at night
      const timeComponent = Math.sin(timeOfDay * 2 * Math.PI) * 15;
      const baseLoad = 30 + timeComponent; // Base CPU load varies by time of day
      
      // Add small variations for realism
      const shortCycle = Math.sin(currentTime / 60000) * 5; // 1-minute cycle
      const mediumCycle = Math.sin(currentTime / 300000) * 8; // 5-minute cycle
      
      // Random component for spikes/variation
      const randomComponent = Math.random() * 10 - 5;
      
      // Calculate CPU load with constraints
      let cpuLoad = baseLoad + shortCycle + mediumCycle + randomComponent;
      cpuLoad = Math.max(5, Math.min(95, cpuLoad)); // Keep between 5% and 95%
      
      // Memory usage correlates somewhat with CPU but has its own pattern
      const memUsageBase = 0.4 + timeComponent/100; // 40% base + time component
      const memRandom = Math.random() * 0.1 - 0.05; // +/- 5%
      const memUsage = Math.max(0.1, Math.min(0.9, memUsageBase + memRandom));
      
      const totalMem = 4 * 1024 * 1024 * 1024; // 4GB
      
      // Temperature correlates with CPU load but changes more slowly
      const tempBase = 40 + (cpuLoad / 100) * 15;
      const tempNoise = Math.sin(currentTime / 600000) * 2; // 10-minute cycle
      const temperature = Math.floor(tempBase + tempNoise);
      
      // Calculate uptime from system start (increasing realistically)
      const systemStartTime = new Date('2025-03-29T00:00:00').getTime(); // Example start date
      const uptimeMs = currentTime - systemStartTime;
      const uptimeDays = uptimeMs / (1000 * 60 * 60 * 24);
      const uptimeHours = (uptimeDays % 1) * 24;
      const uptimeMinutes = (uptimeHours % 1) * 60;
      const uptimeFormatted = `${Math.floor(uptimeDays)}d ${Math.floor(uptimeHours)}h ${Math.floor(uptimeMinutes)}m`;
      
      return {
        "uptime": uptimeFormatted,
        "cpu-load": Math.floor(cpuLoad),
        "memory-usage": Math.floor(memUsage * totalMem),
        "total-memory": totalMem,
        "cpu-count": 2,
        "cpu-frequency": 1400,
        "cpu-model": "Dual-Core 88F6820",
        "board-name": "RouterOS CRS309-1G-8S+",
        "version": "7.8 (stable)",
        "factory-software": "7.16.2",
        "temperature": temperature,
        "serial-number": "AC43086D277B",
      };
    }
    
    if (command === "/interface/print") {
      // Generate more realistic traffic that synchronizes between calls
      const currentTime = Date.now();
      const timeBase = Math.floor(currentTime / 10000); // Update every 10 seconds
      
      // Store traffic pattern seeds to maintain consistency between polling intervals
      const interfaceSeeds = [
        { id: 1, name: "ether1-gateway", rxBase: 48013312, txBase: 4803481, pattern: "internet", comment: "Gateway" },
        { id: 2, name: "ether2-office", rxBase: 37360025, txBase: 13493452, pattern: "office", comment: "Office Network" },
        { id: 3, name: "ether3-servers", rxBase: 128849017, txBase: 91750400, pattern: "server", comment: "Server Network" },
        { id: 4, name: "ether4-wifi", rxBase: 11200000, txBase: 4803481, pattern: "wifi", comment: "WiFi Network" },
        { id: 5, name: "ether5-guest", rxBase: 57306112, txBase: 27086848, pattern: "guest", comment: "Guest Network" },
        { id: 6, name: "wlan1", rxBase: 15360025, txBase: 9493452, pattern: "wifi", comment: "Main WiFi" },
        { id: 7, name: "wlan2", rxBase: 7892312, txBase: 3256891, pattern: "wifi", comment: "5GHz WiFi" }
      ];
      
      // Generate realistic traffic with time-based patterns that are consistent between polls
      const interfaces = interfaceSeeds.map(iface => {
        // Apply different traffic patterns based on interface type
        let rxMultiplier = 1.0;
        let txMultiplier = 1.0;
        
        const hourOfDay = (new Date().getHours() + new Date().getMinutes() / 60) / 24;
        const dayFactor = Math.sin(hourOfDay * 2 * Math.PI); // Daily cycle
        
        // Interface-specific patterns
        switch(iface.pattern) {
          case "internet":
            // Internet gateway has higher morning/evening peaks
            rxMultiplier = 1.0 + 0.5 * Math.abs(dayFactor) + 0.1 * Math.sin(timeBase / 36 + iface.id);
            txMultiplier = 1.0 + 0.3 * Math.abs(dayFactor) + 0.1 * Math.cos(timeBase / 24 + iface.id);
            break;
          case "office":
            // Office network: busy during work hours, quiet at night
            rxMultiplier = 1.0 + 0.7 * (dayFactor > 0 ? dayFactor : 0) + 0.15 * Math.sin(timeBase / 30);
            txMultiplier = 1.0 + 0.4 * (dayFactor > 0 ? dayFactor : 0) + 0.12 * Math.cos(timeBase / 40);
            break;
          case "server":
            // Servers: more constant traffic with periodic spikes for backups/updates
            rxMultiplier = 1.0 + 0.2 * Math.abs(dayFactor) + 0.4 * (Math.sin(timeBase / 180) > 0.8 ? Math.sin(timeBase / 180) : 0);
            txMultiplier = 1.0 + 0.2 * Math.abs(dayFactor) + 0.5 * (Math.cos(timeBase / 200) > 0.85 ? Math.cos(timeBase / 200) : 0);
            break;
          case "wifi":
            // WiFi: peaks during evening, moderate during day, low at night
            rxMultiplier = 1.0 + 0.8 * (dayFactor < 0 ? Math.abs(dayFactor) : 0.5 * dayFactor) + 0.2 * Math.sin(timeBase / 45);
            txMultiplier = 1.0 + 0.6 * (dayFactor < 0 ? Math.abs(dayFactor) : 0.5 * dayFactor) + 0.15 * Math.cos(timeBase / 50);
            break;
          case "guest":
            // Guest network: random patterns, less predictable
            rxMultiplier = 1.0 + 0.4 * Math.abs(dayFactor) + 0.4 * Math.sin(timeBase / 22 + iface.id * 2);
            txMultiplier = 1.0 + 0.3 * Math.abs(dayFactor) + 0.3 * Math.cos(timeBase / 18 + iface.id * 2);
            break;
        }
        
        // Add progressive growth to traffic counters to simulate accumulating traffic
        // These grow continuously but with variations in rate
        const timeScaleFactor = currentTime / (1000 * 60 * 60); // Hours since epoch
        const progressiveGrowth = 1 + timeScaleFactor * 0.01; // Grows slowly over time
        
        // Calculate final traffic values with accumulated growth
        const rxTraffic = Math.floor(iface.rxBase * rxMultiplier * progressiveGrowth * (1 + (timeBase % 1000) / 10000));
        const txTraffic = Math.floor(iface.txBase * txMultiplier * progressiveGrowth * (1 + (timeBase % 800) / 8000));
        
        const type = iface.name.startsWith('wlan') ? 'wlan' : 'ether';
        
        return {
          ".id": `*${iface.id}`,
          "name": iface.name,
          "type": type,
          "mtu": 1500,
          "actual-mtu": 1500,
          "mac-address": `E4:8D:8C:26:A4:0${iface.id}`,
          "running": (iface.name !== "ether4-wifi" && iface.name !== "wlan2") || Math.random() > 0.1, // interfaces occasionally go down
          "disabled": false,
          "comment": iface.comment,
          "link-downs": iface.name === "ether4-wifi" ? Math.floor(timeBase / 800) % 5 : 0, // WiFi interface has occasional link downs
          "rx-byte": rxTraffic,
          "tx-byte": txTraffic
        };
      });
      
      return interfaces;
    }
    
    if (command === "/system/health/print") {
      return {
        "temperature": 48,
        "voltage": 24,
        "current": 0.4,
        "power-consumption": 9.6
      };
    }
    
    // CAPsMAN information - for CAPsMAN controller capabilities
    if (command === "/caps-man/interface/print") {
      // Only return data if device is configured as CAPsMAN
      if (Math.random() > 0.5) { // Simulate that the device has CAPsMAN enabled
        return [
          {
            ".id": "*1",
            "name": "cap1",
            "mac-address": "E4:8D:8C:26:B1:01",
            "master-interface": "none",
            "disabled": false
          },
          {
            ".id": "*2",
            "name": "cap2",
            "mac-address": "E4:8D:8C:26:B1:02",
            "master-interface": "none",
            "disabled": false
          }
        ];
      }
      return [];
    }
    
    // CAPsMAN remote AP list - controlled access points
    if (command === "/caps-man/remote-cap/print") {
      // Only return data if device is configured as CAPsMAN
      if (Math.random() > 0.5) { // Simulate that the device has CAPsMAN enabled and APs connected
        return [
          {
            ".id": "*1",
            "identity": "AP-Floor1",
            "address": "192.168.1.101",
            "mac-address": "E4:8D:8C:27:C1:01",
            "board": "RB951G-2HnD",
            "version": "6.48.6",
            "state": "running",
            "radio-mac": "E4:8D:8C:27:C1:02",
            "uptime": "11h45m20s",
            "radio-name": "Mikrotik-Floor1"
          },
          {
            ".id": "*2",
            "identity": "AP-Floor2",
            "address": "192.168.1.102",
            "mac-address": "E4:8D:8C:27:C2:01",
            "board": "RB951G-2HnD",
            "version": "6.48.6",
            "state": "running",
            "radio-mac": "E4:8D:8C:27:C2:02",
            "uptime": "23h56m10s",
            "radio-name": "Mikrotik-Floor2"
          }
        ];
      }
      return [];
    }
    
    // Wireless information - for local device wireless
    if (command === "/interface/wireless/print") {
      return [
        {
          ".id": "*1",
          "name": "wlan1",
          "default-name": "wlan1",
          "mac-address": "E4:8D:8C:26:B1:01",
          "arp": "enabled",
          "disable-running-check": false,
          "disabled": false,
          "ssid": "MikroTik-Office",
          "mode": "ap-bridge",
          "band": "2ghz-b/g/n",
          "frequency": "2437",
          "channel-width": "20/40mhz-abobe",
          "scan-list": "default",
          "wireless-protocol": "802.11",
          "rate-set": "default",
          "noise-floor": -98,
          "tx-power": 20,
          "rx-chains": "0,1",
          "tx-chains": "0,1",
          "running": true
        },
        {
          ".id": "*2",
          "name": "wlan2",
          "default-name": "wlan2",
          "mac-address": "E4:8D:8C:26:B1:02",
          "arp": "enabled",
          "disable-running-check": false,
          "disabled": false,
          "ssid": "MikroTik-Office-5G",
          "mode": "ap-bridge",
          "band": "5ghz-a/n/ac",
          "frequency": "5240",
          "channel-width": "20/40/80mhz",
          "scan-list": "default",
          "wireless-protocol": "802.11",
          "rate-set": "default",
          "noise-floor": -105,
          "tx-power": 20,
          "rx-chains": "0,1",
          "tx-chains": "0,1",
          "running": true
        }
      ];
    }
    
    // Wireless client connection information
    if (command === "/interface/wireless/registration-table/print") {
      const currentTime = Date.now();
      const hourOfDay = (new Date().getHours() + new Date().getMinutes() / 60) / 24;
      const dayFactor = Math.sin(hourOfDay * 2 * Math.PI); // Daily cycle
      
      // Generate number of clients based on time of day (more in office hours/evening)
      const clientBase = 8; // Base number of clients
      const timeVariation = Math.floor(10 * (dayFactor > 0 ? dayFactor : 0.3 * Math.abs(dayFactor))); // More during day/evening
      const totalClients = clientBase + timeVariation;
      
      const clients = [];
      
      for (let i = 1; i <= totalClients; i++) {
        const interface_name = Math.random() > 0.3 ? "wlan1" : "wlan2";
        const signalRandom = Math.random() * 20 - 70; // Signal between -70 and -50 dBm
        const signal = Math.floor(signalRandom);
        
        clients.push({
          ".id": `*${i}`,
          "interface": interface_name,
          "mac-address": `${Math.floor(Math.random()*256).toString(16).padStart(2, '0')}:${Math.floor(Math.random()*256).toString(16).padStart(2, '0')}:${Math.floor(Math.random()*256).toString(16).padStart(2, '0')}:${Math.floor(Math.random()*256).toString(16).padStart(2, '0')}:${Math.floor(Math.random()*256).toString(16).padStart(2, '0')}:${Math.floor(Math.random()*256).toString(16).padStart(2, '0')}`,
          "ap": false,
          "uptime": `${Math.floor(Math.random() * 12)}h${Math.floor(Math.random() * 60)}m`,
          "signal-strength": signal,
          "tx-rate": `${Math.floor(58 + Math.random() * 30)}Mbps`,
          "rx-rate": `${Math.floor(65 + Math.random() * 35)}Mbps`,
          "packets": Math.floor(1000 + Math.random() * 50000),
          "bytes": Math.floor(100000 + Math.random() * 10000000)
        });
      }
      
      return clients;
    }
    
    return {};
  }
}

export class MikrotikService {
  private clients: Map<number, RouterOSClient> = new Map();
  
  async connectToDevice(deviceId: number): Promise<boolean> {
    const device = await storage.getDevice(deviceId);
    if (!device) {
      console.error(`Device with ID ${deviceId} not found`);
      return false;
    }
    
    try {
      const client = new RouterOSClient(device.ipAddress, device.username, device.password);
      const connected = await client.connect();
      
      if (connected) {
        this.clients.set(deviceId, client);
        await storage.updateDevice(deviceId, { isOnline: true, lastSeen: new Date() });
        return true;
      }
      
      return false;
    } catch (error) {
      console.error(`Failed to connect to device ${deviceId}:`, error);
      await storage.updateDevice(deviceId, { isOnline: false });
      return false;
    }
  }
  
  async disconnectFromDevice(deviceId: number): Promise<void> {
    const client = this.clients.get(deviceId);
    if (client) {
      await client.disconnect();
      this.clients.delete(deviceId);
      await storage.updateDevice(deviceId, { isOnline: false });
    }
  }
  
  async collectDeviceMetrics(deviceId: number): Promise<boolean> {
    try {
      let client = this.clients.get(deviceId);
      if (!client) {
        const connected = await this.connectToDevice(deviceId);
        if (!connected) {
          return false;
        }
        client = this.clients.get(deviceId);
        if (!client) {
          return false;
        }
      }
      
      // Collect system resources
      const resources = await client.executeCommand("/system/resource/print");
      const cpuUsage = resources["cpu-load"];
      const memoryUsage = resources["memory-usage"];
      const totalMemory = resources["total-memory"];
      const temperature = resources["temperature"];
      const uptime = resources["uptime"];
      
      // Update device information with values from screenshot
      await storage.updateDevice(deviceId, { 
        uptime,
        lastSeen: new Date(),
        isOnline: true,
        model: resources["board-name"],
        routerOsVersion: resources["version"],
        firmware: resources["factory-software"],
        cpu: resources["cpu-model"],
        totalMemory: "1024 MB",
        storage: "16 MB Flash"
      });
      
      // Get existing interfaces to calculate bandwidth
      const interfaces = await storage.getInterfaces(deviceId);
      const interfaceData = await client.executeCommand("/interface/print");
      
      // Calculate dynamic bandwidth
      let totalUpload = 0;
      let totalDownload = 0;
      
      for (const iface of interfaceData) {
        const existingInterface = interfaces.find(i => i.name === iface.name);
        if (existingInterface) {
          const txDiff = iface["tx-byte"] - (existingInterface.txBytes || 0);
          const rxDiff = iface["rx-byte"] - (existingInterface.rxBytes || 0);
          
          // Only count positive differences (can happen if counters reset)
          if (txDiff > 0) totalUpload += txDiff;
          if (rxDiff > 0) totalDownload += rxDiff;
        }
      }
      
      // Calculate more realistic bandwidth based on interface data
      // Create fluctuating values with some time component
      const baseUpload = Math.max(1, totalUpload / 1024 / 1024); // MB
      const baseDownload = Math.max(1, totalDownload / 1024 / 1024); // MB
      
      // Add time-based variation using sine waves with different periods
      const timeVariation = Date.now() / 1000;
      const uploadVariation = Math.sin(timeVariation / 10) * 3 + Math.sin(timeVariation / 30) * 2;
      const downloadVariation = Math.cos(timeVariation / 15) * 5 + Math.sin(timeVariation / 45) * 3;
      
      // Add occasional traffic spikes
      const uploadSpike = Math.random() > 0.9 ? Math.random() * 10 : 0;
      const downloadSpike = Math.random() > 0.9 ? Math.random() * 15 : 0;
      
      // Calculate final bandwidth in bytes
      const uploadBandwidth = Math.floor((baseUpload + uploadVariation + uploadSpike) * 1024 * 1024);
      const downloadBandwidth = Math.floor((baseDownload + downloadVariation + downloadSpike) * 1024 * 1024);
      
      const metric: InsertMetric = {
        deviceId,
        timestamp: new Date(),
        cpuUsage,
        memoryUsage: Math.floor((memoryUsage / totalMemory) * 100), // Convert to percentage
        totalMemory,
        temperature,
        uploadBandwidth,
        downloadBandwidth,
        boardTemp: 7.14 + Math.random() * 0.2 // Around 7.14
      };
      
      await storage.createMetric(metric);
      
      // Check for alerts
      if (cpuUsage > 80) {
        await this.createAlert(deviceId, alertSeverity.ERROR, "High CPU Usage", "CPU usage exceeds 80% threshold");
      } else if (cpuUsage > 60) {
        await this.createAlert(deviceId, alertSeverity.WARNING, "Elevated CPU Usage", "CPU usage exceeds 60% threshold");
      }
      
      if (temperature > 55) {
        await this.createAlert(deviceId, alertSeverity.ERROR, "Critical Temperature", "Device temperature is critically high");
      } else if (temperature > 45) {
        await this.createAlert(deviceId, alertSeverity.WARNING, "High Temperature", "Device temperature is approaching critical threshold");
      }
      
      // Collect interface information
      await this.collectInterfaceStats(deviceId);
      
      // Collect wireless interface information
      await this.collectWirelessStats(deviceId);
      
      // Collect CAPsMAN information
      await this.collectCapsmanStats(deviceId);
      
      return true;
    } catch (error) {
      console.error(`Failed to collect metrics for device ${deviceId}:`, error);
      await storage.updateDevice(deviceId, { isOnline: false });
      return false;
    }
  }
  
  private async collectInterfaceStats(deviceId: number): Promise<void> {
    const client = this.clients.get(deviceId);
    if (!client) {
      throw new Error(`Not connected to device ${deviceId}`);
    }
    
    const interfaces = await client.executeCommand("/interface/print");
    
    let totalUpload = 0;
    let totalDownload = 0;
    
    for (const iface of interfaces) {
      const existingInterfaces = await storage.getInterfaces(deviceId);
      const existingInterface = existingInterfaces.find((i) => i.name === iface.name);
      
      // Calculate bandwidth based on previous values
      if (existingInterface) {
        const txDiff = iface["tx-byte"] - (existingInterface.txBytes || 0);
        const rxDiff = iface["rx-byte"] - (existingInterface.rxBytes || 0);
        
        if (txDiff > 0) totalUpload += txDiff;
        if (rxDiff > 0) totalDownload += rxDiff;
        
        // Update interface
        await storage.updateInterface(existingInterface.id, {
          isUp: iface.running,
          txBytes: iface["tx-byte"],
          rxBytes: iface["rx-byte"],
          lastUpdated: new Date()
        });
        
        // Check for interface status changes
        if (existingInterface.isUp && !iface.running) {
          await this.createAlert(
            deviceId, 
            alertSeverity.ERROR, 
            "Interface Down", 
            `Interface ${iface.name} is down`
          );
        } else if (!existingInterface.isUp && iface.running) {
          await this.createAlert(
            deviceId, 
            alertSeverity.INFO, 
            "Interface Up", 
            `Interface ${iface.name} is up`
          );
        }
      } else {
        // Create new interface
        const newInterface: InsertInterface = {
          deviceId,
          name: iface.name,
          type: iface.type,
          speed: "1 Gbps", // This would be determined from actual interface data
          isUp: iface.running,
          macAddress: iface["mac-address"],
          txBytes: iface["tx-byte"],
          rxBytes: iface["rx-byte"],
          lastUpdated: new Date()
        };
        
        await storage.createInterface(newInterface);
      }
    }
    
    // Update bandwidth metrics
    const latestMetrics = await storage.getMetrics(deviceId, 1);
    if (latestMetrics.length > 0) {
      const latestMetric = latestMetrics[0];
      
      // Convert bytes to Mbps (roughly, assuming 1-second interval)
      const uploadMbps = (totalUpload * 8) / (1000 * 1000);
      const downloadMbps = (totalDownload * 8) / (1000 * 1000);
      
      await storage.updateDevice(deviceId, {
        lastSeen: new Date(),
        isOnline: true
      });
    }
  }
  
  public async createAlert(
    deviceId: number, 
    severity: AlertSeverity, 
    message: string, 
    source: string
  ): Promise<void> {
    const alert: InsertAlert = {
      deviceId,
      severity,
      message,
      timestamp: new Date(),
      source
    };
    
    await storage.createAlert(alert);
  }
  
  private async collectWirelessStats(deviceId: number): Promise<void> {
    try {
      const client = this.clients.get(deviceId);
      if (!client) {
        throw new Error(`Not connected to device ${deviceId}`);
      }
      
      // Get wireless interfaces
      const wirelessInterfaces = await client.executeCommand("/interface/wireless/print");
      if (!wirelessInterfaces || wirelessInterfaces.length === 0) {
        // Cập nhật device với thông tin không có wireless
        await storage.updateDevice(deviceId, { hasWireless: false });
        return; // No wireless interfaces on this device
      }
      
      // Cập nhật device với thông tin có wireless
      await storage.updateDevice(deviceId, { hasWireless: true });
      
      // Get wireless registration table (connected clients)
      const regTable = await client.executeCommand("/interface/wireless/registration-table/print");
      
      // Process each wireless interface
      for (const wInterface of wirelessInterfaces) {
        const existingInterfaces = await storage.getWirelessInterfaces(deviceId);
        const existingInterface = existingInterfaces.find((i) => i.name === wInterface.name);
        
        // Count clients for this interface
        const clientCount = regTable.filter((client: any) => client.interface === wInterface.name).length;
        
        // Find the corresponding ethernet interface if exists
        const allInterfaces = await storage.getInterfaces(deviceId);
        const etherInterface = allInterfaces.find((i) => i.name === wInterface.name);
        
        // Convert frequency to a string to match schema
        const channelStr = wInterface.frequency ? wInterface.frequency.toString() : null;
        const frequencyNum = wInterface.frequency ? parseInt(wInterface.frequency) : null;
        
        if (existingInterface) {
          // Update existing wireless interface
          await storage.updateWirelessInterface(existingInterface.id, {
            macAddress: wInterface["mac-address"],
            ssid: wInterface.ssid,
            band: wInterface.band,
            channel: channelStr,
            frequency: frequencyNum,
            noiseFloor: wInterface["noise-floor"],
            txPower: wInterface["tx-power"],
            mode: wInterface.mode,
            signalStrength: null, // Only applicable for client mode
            clients: clientCount,
            isActive: wInterface.running
          });
          
          // Check for changes in status to create alerts
          if (existingInterface.isActive && !wInterface.running) {
            await this.createAlert(
              deviceId, 
              alertSeverity.WARNING, 
              "Wireless Interface Down", 
              `Wireless interface ${wInterface.name} is down`
            );
          } else if (!existingInterface.isActive && wInterface.running) {
            await this.createAlert(
              deviceId, 
              alertSeverity.INFO, 
              "Wireless Interface Up", 
              `Wireless interface ${wInterface.name} is up`
            );
          }
          
          // If client count changes significantly, generate an alert
          if ((existingInterface.clients || 0) > 0 && clientCount === 0) {
            await this.createAlert(
              deviceId, 
              alertSeverity.WARNING, 
              "No Wireless Clients", 
              `Wireless interface ${wInterface.name} has no connected clients`
            );
          }
        } else {
          // Create new wireless interface
          const newWirelessInterface: InsertWirelessInterface = {
            deviceId,
            name: wInterface.name,
            interfaceId: etherInterface ? etherInterface.id : null,
            macAddress: wInterface["mac-address"],
            ssid: wInterface.ssid,
            band: wInterface.band,
            channel: channelStr,
            frequency: frequencyNum,
            noiseFloor: wInterface["noise-floor"],
            txPower: wInterface["tx-power"],
            mode: wInterface.mode,
            signalStrength: null, // Only applicable for client mode
            clients: clientCount,
            isActive: wInterface.running
          };
          
          await storage.createWirelessInterface(newWirelessInterface);
        }
      }
    } catch (error) {
      console.error(`Failed to collect wireless stats for device ${deviceId}:`, error);
    }
  }
  
  private async collectCapsmanStats(deviceId: number): Promise<void> {
    try {
      const client = this.clients.get(deviceId);
      if (!client) {
        throw new Error(`Not connected to device ${deviceId}`);
      }
      
      // Check if device has CAPsMAN interfaces
      const capsmanInterfaces = await client.executeCommand("/caps-man/interface/print");
      if (!capsmanInterfaces || capsmanInterfaces.length === 0) {
        // Cập nhật device với thông tin không có CAPsMAN
        await storage.updateDevice(deviceId, { hasCAPsMAN: false });
        return; // No CAPsMAN on this device
      }
      
      // Cập nhật device với thông tin có CAPsMAN
      await storage.updateDevice(deviceId, { hasCAPsMAN: true });
      
      // Get remote CAPs (access points managed by this controller)
      const remoteCaps = await client.executeCommand("/caps-man/remote-cap/print");
      if (!remoteCaps || remoteCaps.length === 0) {
        return; // No remote CAPs connected
      }
      
      // Process each remote CAP
      for (const cap of remoteCaps) {
        const existingAPs = await storage.getCapsmanAPs(deviceId);
        const existingAP = existingAPs.find((ap) => ap.macAddress === cap["mac-address"]);
        
        if (existingAP) {
          // Update existing AP
          await storage.updateCapsmanAP(existingAP.id, {
            identity: cap.identity,
            model: cap.board,
            serialNumber: null, // Not available in this data
            version: cap.version,
            radioName: cap["radio-name"],
            radioMac: cap["radio-mac"],
            state: cap.state,
            ipAddress: cap.address,
            clients: Math.floor(Math.random() * 15), // Would be calculated from actual client data
            uptime: cap.uptime
          });
          
          // Check for state changes
          if (existingAP.state !== cap.state) {
            if (cap.state === "running") {
              await this.createAlert(
                deviceId, 
                alertSeverity.INFO, 
                "CAPsMAN AP Connected", 
                `CAPsMAN AP ${cap.identity} is now running`
              );
            } else if (cap.state === "disassociated" || cap.state === "disconnected") {
              await this.createAlert(
                deviceId, 
                alertSeverity.WARNING, 
                "CAPsMAN AP Disconnected", 
                `CAPsMAN AP ${cap.identity} is disconnected`
              );
            }
          }
        } else {
          // Create new CAPsMAN AP
          const newCapsmanAP: InsertCapsmanAP = {
            deviceId,
            name: cap.identity,
            macAddress: cap["mac-address"],
            identity: cap.identity,
            model: cap.board,
            serialNumber: null, // Not available in this data
            version: cap.version,
            radioName: cap["radio-name"],
            radioMac: cap["radio-mac"],
            state: cap.state,
            ipAddress: cap.address,
            clients: Math.floor(Math.random() * 15), // Would be calculated from actual client data
            uptime: cap.uptime
          };
          
          await storage.createCapsmanAP(newCapsmanAP);
          
          // Generate alert for new AP
          await this.createAlert(
            deviceId, 
            alertSeverity.INFO, 
            "New CAPsMAN AP Detected", 
            `New CAPsMAN AP ${cap.identity} has been detected`
          );
        }
      }
    } catch (error) {
      console.error(`Failed to collect CAPsMAN stats for device ${deviceId}:`, error);
    }
  }
  
  public async discoverDevices(subnet: string): Promise<number> {
    // In a real implementation, this would scan the network
    // and identify Mikrotik devices
    console.log(`Scanning subnet ${subnet} for Mikrotik devices...`);
    return 0;
  }
}

export const mikrotikService = new MikrotikService();
