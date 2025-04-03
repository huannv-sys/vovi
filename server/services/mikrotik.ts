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
import * as rosjs from 'routeros-client';

// RouterOS client for connecting to MikroTik devices
// Currently uses a mock implementation, but can be replaced with actual API client
class MikrotikClient {
  private connected: boolean = false;
  private ipAddress: string;
  private username: string;
  private password: string;
  private client: rosjs.RouterOSClient | null = null;
  private useMockData: boolean = true; // Set to true to use mock data during testing
  
  constructor(ipAddress: string, username: string, password: string) {
    this.ipAddress = ipAddress;
    this.username = username;
    this.password = password;
  }

  async connect(): Promise<boolean> {
    try {
      console.log(`Connecting to RouterOS device at ${this.ipAddress}`);
      
      if (this.useMockData) {
        // Use mock data for development/testing
        console.log(`Using mock data for device at ${this.ipAddress}`);
        this.connected = true;
        return true;
      }
      
      // Real connection with RouterOS client
      try {
        console.log(`Attempting real connection to ${this.ipAddress}`);
        
        // Create RouterOS API client
        this.client = new rosjs.RouterOSClient({
          host: this.ipAddress,
          user: this.username,
          password: this.password,
          timeout: 5000 // 5 second timeout
        });
        
        // Connect to the device
        if (this.client) {
          await this.client.connect();
          console.log(`Successfully connected to ${this.ipAddress}`);
          this.connected = true;
          return true;
        }
        return false;
      } catch (connectionError) {
        console.error(`Failed to connect to MikroTik device at ${this.ipAddress}:`, connectionError);
        this.connected = false;
        this.client = null;
        return false;
      }
    } catch (error) {
      console.error(`Error in connect method for ${this.ipAddress}:`, error);
      this.connected = false;
      this.client = null;
      return false;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.useMockData && this.client) {
      try {
        await this.client.close();
      } catch (error) {
        console.error(`Error closing connection to ${this.ipAddress}:`, error);
      }
      this.client = null;
    }
    this.connected = false;
  }

  async executeCommand(command: string, params: any[] = []): Promise<any> {
    if (!this.connected) {
      throw new Error("Not connected to RouterOS device");
    }
    
    // If using real connection with RouterOS client
    if (!this.useMockData && this.client) {
      try {
        console.log(`Executing real command: ${command}`);
        // Convert command like "/system/resource/print" to ["system", "resource", "print"]
        const commandParts = command.split('/').filter(Boolean);
        
        // Use RouterOSAPI's methods to execute commands
        if (!this.client) {
          throw new Error("RouterOS client not initialized");
        }
        
        // Format params in the way RouterOS API expects
        let apiParams: Record<string, any> = {};
        if (params.length > 0 && typeof params[0] === 'object') {
          apiParams = params[0];
        }
        
        console.log(`Executing command ${commandParts.join('/')} with params:`, apiParams);
        
        // Create a menu path based on command parts (except the last one which is the action)
        const api = this.client.api();
        const action = commandParts.pop(); // Get the last part (action) from the command
        const model = new rosjs.RosApiModel(api);
        
        // Navigate to the correct API path/menu
        let menu = model.menu();
        for (const part of commandParts) {
          menu = menu.menu(part);
        }
        
        // Execute the corresponding action (print, add, remove, etc.)
        let result;
        if (action === 'print') {
          // Handle print action
          result = await menu.print(apiParams);
        } else if (action === 'add') {
          // Handle add action
          result = await menu.add(apiParams);
        } else if (action === 'remove') {
          // Handle remove action
          result = await menu.remove(apiParams);
        } else if (action === 'set') {
          // Handle set action
          result = await menu.set(apiParams);
        } else {
          throw new Error(`Unsupported action: ${action}`);
        }
        
        console.log(`Got result from real device for ${command}:`, result);
        return result;
      } catch (error) {
        console.error(`Failed to execute command ${command}:`, error);
        // Nếu kết nối thất bại, đặt this.connected thành false để thử kết nối lại
        this.connected = false;
        throw error;
      }
    }
    
    // For development, using mock responses that simulate real data
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
  private clients: Map<number, MikrotikClient> = new Map();
  
  async connectToDevice(deviceId: number): Promise<boolean> {
    const device = await storage.getDevice(deviceId);
    if (!device) {
      console.error(`Device with ID ${deviceId} not found`);
      return false;
    }
    
    try {
      const client = new MikrotikClient(device.ipAddress, device.username, device.password);
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
        totalMemory: resources["total-memory"].toString()
      });
      
      // Create a new metric record
      const metric: InsertMetric = {
        deviceId,
        timestamp: new Date(),
        cpuUsage,
        memoryUsage,
        totalMemory,
        temperature
      };
      
      await storage.createMetric(metric);
      
      // Collect interface statistics
      await this.collectInterfaceStats(deviceId);
      
      // Collect wireless information if available
      await this.collectWirelessStats(deviceId);
      
      // Collect CAPsMAN information if available
      await this.collectCapsmanStats(deviceId);
      
      return true;
    } catch (err) {
      const error = err as Error;
      console.error(`Failed to collect metrics for device ${deviceId}:`, error.message);
      await storage.updateDevice(deviceId, { isOnline: false });
      return false;
    }
  }
  
  public async createAlert(
    deviceId: number, 
    severity: AlertSeverity, 
    title: string, 
    message: string
  ): Promise<any> {
    const alert: InsertAlert = {
      deviceId,
      timestamp: new Date(),
      severity,
      message,
      source: title // use title as source since title doesn't exist in schema
    };
    
    return await storage.createAlert(alert);
  }
  
  private async collectInterfaceStats(deviceId: number): Promise<void> {
    try {
      const client = this.clients.get(deviceId);
      if (!client) {
        throw new Error(`Not connected to device ${deviceId}`);
      }
      
      const interfaces = await client.executeCommand("/interface/print");
      if (!interfaces || !Array.isArray(interfaces)) {
        return;
      }
      
      for (const iface of interfaces) {
        const existingInterfaces = await storage.getInterfaces(deviceId);
        const existingInterface = existingInterfaces.find((i) => i.name === iface.name);
        
        const newInterface: InsertInterface = {
          deviceId,
          name: iface.name,
          type: iface.type,
          macAddress: iface["mac-address"],
          mtu: iface.mtu,
          running: iface.running,
          disabled: iface.disabled,
          comment: iface.comment || null,
          rxBytes: iface["rx-byte"],
          txBytes: iface["tx-byte"],
          linkDowns: iface["link-downs"] || 0
        };
        
        if (existingInterface) {
          await storage.updateInterface(existingInterface.id, newInterface);
          
          // Check if interface status changed
          if (existingInterface.running !== iface.running) {
            if (iface.running) {
              await this.createAlert(
                deviceId, 
                alertSeverity.INFO, 
                "Interface Up", 
                `Interface ${iface.name} is now up`
              );
            } else {
              await this.createAlert(
                deviceId, 
                alertSeverity.WARNING, 
                "Interface Down", 
                `Interface ${iface.name} is down`
              );
            }
          }
        } else {
          await storage.createInterface(newInterface);
        }
      }
    } catch (err) {
      const error = err as Error;
      console.error(`Failed to collect interface stats for device ${deviceId}:`, error.message);
    }
  }
  
  private async collectWirelessStats(deviceId: number): Promise<void> {
    try {
      const client = this.clients.get(deviceId);
      if (!client) {
        throw new Error(`Not connected to device ${deviceId}`);
      }
      
      try {
        // Get wireless interfaces
        const wirelessInterfaces = await client.executeCommand("/interface/wireless/print");
        if (!wirelessInterfaces || !Array.isArray(wirelessInterfaces) || wirelessInterfaces.length === 0) {
          return; // No wireless on this device
        }
        
        for (const wifiInterface of wirelessInterfaces) {
          const existingWifi = await storage.getWirelessInterfaces(deviceId);
          const existingInterface = existingWifi.find((w) => w.name === wifiInterface.name);
          
          const newWirelessInterface: InsertWirelessInterface = {
            deviceId,
            name: wifiInterface.name,
            macAddress: wifiInterface["mac-address"],
            ssid: wifiInterface.ssid,
            band: wifiInterface.band,
            frequency: parseInt(wifiInterface.frequency),
            channelWidth: wifiInterface["channel-width"],
            mode: wifiInterface.mode,
            txPower: wifiInterface["tx-power"],
            noiseFloor: wifiInterface["noise-floor"] || null,
            running: wifiInterface.running,
            disabled: wifiInterface.disabled
          };
          
          if (existingInterface) {
            await storage.updateWirelessInterface(existingInterface.id, newWirelessInterface);
            
            // Check if wireless interface status changed
            if (existingInterface.running !== wifiInterface.running) {
              if (wifiInterface.running) {
                await this.createAlert(
                  deviceId, 
                  alertSeverity.INFO, 
                  "Wireless Interface Up", 
                  `Wireless interface ${wifiInterface.name} (${wifiInterface.ssid}) is now up`
                );
              } else {
                await this.createAlert(
                  deviceId, 
                  alertSeverity.WARNING, 
                  "Wireless Interface Down", 
                  `Wireless interface ${wifiInterface.name} (${wifiInterface.ssid}) is down`
                );
              }
            }
          } else {
            await storage.createWirelessInterface(newWirelessInterface);
          }
        }
        
        // Get wireless client connections
        const wirelessClients = await client.executeCommand("/interface/wireless/registration-table/print");
        if (wirelessClients && Array.isArray(wirelessClients)) {
          // Process wireless clients here if needed
          // For now, we're not storing wireless clients in the database
          // but could be added in the future
        }
      } catch (wirelessError) {
        // Suppress errors for devices without wireless capabilities
        console.log(`Device ${deviceId} might not have wireless capabilities:`, wirelessError);
      }
    } catch (err) {
      const error = err as Error;
      console.error(`Failed to collect wireless stats for device ${deviceId}:`, error.message);
    }
  }
  
  private async collectCapsmanStats(deviceId: number): Promise<void> {
    try {
      const client = this.clients.get(deviceId);
      if (!client) {
        throw new Error(`Not connected to device ${deviceId}`);
      }
      
      console.log(`Collecting CAPsMAN data for device ${deviceId}...`);
      
      // Variable to hold remote CAPs data
      let remoteCaps = [];
      
      try {
        // Check if device has CAPsMAN interfaces
        const capsmanInterfaces = await client.executeCommand("/caps-man/interface/print");
        
        // If we get here without error, the command worked and the device has CAPsMAN
        const hasCapsmanEnabled = Array.isArray(capsmanInterfaces) && capsmanInterfaces.length > 0;
        
        // Update device with CAPsMAN status
        await storage.updateDevice(deviceId, { hasCAPsMAN: hasCapsmanEnabled });
        
        if (!hasCapsmanEnabled) {
          console.log(`Device ${deviceId} does not have CAPsMAN enabled`);
          return; // No CAPsMAN on this device
        }
        
        console.log(`Device ${deviceId} has CAPsMAN enabled with ${capsmanInterfaces.length} interfaces`);
        
        // Get remote CAPs (access points managed by this controller)
        remoteCaps = await client.executeCommand("/caps-man/remote-cap/print");
        
        if (!Array.isArray(remoteCaps) || remoteCaps.length === 0) {
          console.log(`Device ${deviceId} has no CAPsMAN remote APs connected`);
          return; // No remote CAPs connected
        }
        
        console.log(`Device ${deviceId} has ${remoteCaps.length} CAPsMAN remote APs`);
      } catch (err) {
        // If we get an error executing CAPsMAN commands, the device likely doesn't have CAPsMAN
        const error = err as Error;
        console.error(`Error collecting CAPsMAN data for device ${deviceId}: ${error.message}`);
        await storage.updateDevice(deviceId, { hasCAPsMAN: false });
        return;
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
    } catch (err) {
      const error = err as Error;
      console.error(`Failed to collect CAPsMAN stats for device ${deviceId}:`, error.message);
    }
  }
  
  public async discoverDevices(subnet: string): Promise<number> {
    // In a real implementation, this would scan the network using an actual API
    // and identify Mikrotik devices through RouterOS API or SNMP
    console.log(`Scanning subnet ${subnet} for Mikrotik devices...`);
    
    // TODO: Replace with actual network scan implementation
    // Example implementation with real discovery:
    /*
    let discoveredCount = 0;
    
    // Parse subnet (e.g. "192.168.1.0/24")
    const [baseIP, mask] = subnet.split('/');
    const maskBits = parseInt(mask);
    
    if (isNaN(maskBits) || maskBits < 0 || maskBits > 32) {
      throw new Error(`Invalid subnet mask: ${mask}`);
    }
    
    // Calculate IP range to scan
    const baseIPParts = baseIP.split('.').map(part => parseInt(part));
    const ipCount = 2 ** (32 - maskBits);
    const maxHosts = Math.min(ipCount - 2, 254); // Practical limit for scanning
    
    // For each IP in the range
    const promises = [];
    for (let i = 1; i <= maxHosts; i++) {
      const ip = `${baseIPParts[0]}.${baseIPParts[1]}.${baseIPParts[2]}.${i}`;
      promises.push(this.checkIfMikrotik(ip));
    }
    
    // Wait for all scans to complete
    const results = await Promise.all(promises);
    const discoveredDevices = results.filter(Boolean);
    
    // Add discovered devices to storage
    for (const device of discoveredDevices) {
      try {
        await storage.createDevice({
          name: device.identity || `MikroTik at ${device.ip}`,
          ipAddress: device.ip,
          username: 'admin', // Default credentials, should be updated
          password: '',
          description: `Automatically discovered device: ${device.model || 'Unknown model'}`,
          location: 'Auto-discovered',
          model: device.model || 'Unknown',
          serialNumber: device.serial || null,
          isOnline: true,
          lastSeen: new Date(),
          hasCAPsMAN: false, // Will be updated later
          tags: ['auto-discovered']
        });
        discoveredCount++;
      } catch (error) {
        console.error(`Failed to add discovered device at ${device.ip}:`, error);
      }
    }
    
    return discoveredCount;
    */
    
    // For testing/demo, simulate discovery of 2-4 devices
    const discoveryCount = Math.floor(Math.random() * 3) + 2;
    console.log(`Discovered ${discoveryCount} devices`);
    return discoveryCount;
  }
  
  // This method would be implemented to check if a device at a specific IP
  // is a MikroTik device and return its basic information
  private async checkIfMikrotik(ipAddress: string): Promise<any> {
    // TODO: Implement real device detection
    // Example implementation:
    /*
    try {
      // Try to connect with default credentials
      const client = new MikrotikClient(ipAddress, 'admin', '');
      const connected = await client.connect();
      
      if (!connected) {
        return null;
      }
      
      // Get system identity and resources
      const identity = await client.executeCommand('/system/identity/print');
      const resources = await client.executeCommand('/system/resource/print');
      
      await client.disconnect();
      
      return {
        ip: ipAddress,
        identity: identity.length > 0 ? identity[0].name : null,
        model: resources.length > 0 ? resources[0]['board-name'] : null,
        serial: resources.length > 0 ? resources[0]['serial-number'] : null
      };
    } catch (error) {
      // Not a MikroTik device or not accessible
      return null;
    }
    */
    
    return null;
  }
}

export const mikrotikService = new MikrotikService();