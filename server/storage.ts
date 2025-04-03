import {
  type Device,
  type InsertDevice,
  type Metric,
  type InsertMetric,
  type Interface,
  type InsertInterface,
  type Alert,
  type InsertAlert,
  type WirelessInterface,
  type InsertWirelessInterface,
  type CapsmanAP,
  type InsertCapsmanAP,
  type CapsmanClient,
  type InsertCapsmanClient,
  devices,
  metrics,
  interfaces,
  alerts,
  wirelessInterfaces,
  capsmanAPs,
  capsmanClients,
} from "@shared/schema";

export interface IStorage {
  // Device operations
  getAllDevices(): Promise<Device[]>;
  getDevice(id: number): Promise<Device | undefined>;
  getDeviceByIp(ipAddress: string): Promise<Device | undefined>;
  createDevice(device: InsertDevice): Promise<Device>;
  updateDevice(id: number, device: Partial<Device>): Promise<Device | undefined>;
  deleteDevice(id: number): Promise<boolean>;

  // Metric operations
  getMetrics(deviceId: number, limit?: number): Promise<Metric[]>;
  createMetric(metric: InsertMetric): Promise<Metric>;

  // Interface operations
  getInterfaces(deviceId: number): Promise<Interface[]>;
  getInterface(id: number): Promise<Interface | undefined>;
  createInterface(iface: InsertInterface): Promise<Interface>;
  updateInterface(id: number, iface: Partial<Interface>): Promise<Interface | undefined>;

  // Alert operations
  getAlerts(deviceId?: number, acknowledged?: boolean, limit?: number): Promise<Alert[]>;
  createAlert(alert: InsertAlert): Promise<Alert>;
  acknowledgeAlert(id: number): Promise<Alert | undefined>;
  acknowledgeAllAlerts(deviceId?: number): Promise<number>;
  
  // Wireless Interface operations
  getWirelessInterfaces(deviceId: number): Promise<WirelessInterface[]>;
  getWirelessInterface(id: number): Promise<WirelessInterface | undefined>;
  createWirelessInterface(wireless: InsertWirelessInterface): Promise<WirelessInterface>;
  updateWirelessInterface(id: number, wireless: Partial<WirelessInterface>): Promise<WirelessInterface | undefined>;
  deleteWirelessInterface(id: number): Promise<boolean>;
  
  // CAPsMAN AP operations
  getCapsmanAPs(deviceId: number): Promise<CapsmanAP[]>;
  getCapsmanAP(id: number): Promise<CapsmanAP | undefined>;
  createCapsmanAP(ap: InsertCapsmanAP): Promise<CapsmanAP>;
  updateCapsmanAP(id: number, ap: Partial<CapsmanAP>): Promise<CapsmanAP | undefined>;
  deleteCapsmanAP(id: number): Promise<boolean>;
  
  // CAPsMAN Client operations
  getCapsmanClients(apId: number): Promise<CapsmanClient[]>;
  getCapsmanClientsByDevice(deviceId: number): Promise<CapsmanClient[]>;
  getCapsmanClient(id: number): Promise<CapsmanClient | undefined>;
  createCapsmanClient(client: InsertCapsmanClient): Promise<CapsmanClient>;
  updateCapsmanClient(id: number, client: Partial<CapsmanClient>): Promise<CapsmanClient | undefined>;
  deleteCapsmanClient(id: number): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private devices: Map<number, Device>;
  private metrics: Map<number, Metric>;
  private interfaces: Map<number, Interface>;
  private alerts: Map<number, Alert>;
  private wirelessInterfaces: Map<number, WirelessInterface>;
  private capsmanAPs: Map<number, CapsmanAP>;
  private capsmanClients: Map<number, CapsmanClient>;
  private deviceIdCounter: number;
  private metricIdCounter: number;
  private interfaceIdCounter: number;
  private alertIdCounter: number;
  private wirelessInterfaceIdCounter: number;
  private capsmanAPIdCounter: number;
  private capsmanClientIdCounter: number;

  constructor() {
    this.devices = new Map();
    this.metrics = new Map();
    this.interfaces = new Map();
    this.alerts = new Map();
    this.wirelessInterfaces = new Map();
    this.capsmanAPs = new Map();
    this.capsmanClients = new Map();
    this.deviceIdCounter = 1;
    this.metricIdCounter = 1;
    this.interfaceIdCounter = 1;
    this.alertIdCounter = 1;
    this.wirelessInterfaceIdCounter = 1;
    this.capsmanAPIdCounter = 1;
    this.capsmanClientIdCounter = 1;

    // Add sample device for initial testing
    this.createDevice({
      name: "MikroTik Router - Office Main",
      ipAddress: "192.168.1.1",
      username: "admin",
      password: "password",
      model: "RouterOS CRS309-1G-8S+",
      serialNumber: "AC43086D277B",
      routerOsVersion: "7.8 (stable)",
      firmware: "7.16.2",
      cpu: "Dual-Core 88F6820",
      totalMemory: "1024 MB",
      storage: "16 MB Flash",
    }).then(device => {
      // Kích hoạt CAPsMAN và Wireless cho thiết bị ban đầu
      this.updateDevice(device.id, {
        hasCAPsMAN: true,
        hasWireless: true
      });
    });
  }

  // Device operations
  async getAllDevices(): Promise<Device[]> {
    return Array.from(this.devices.values());
  }

  async getDevice(id: number): Promise<Device | undefined> {
    return this.devices.get(id);
  }

  async getDeviceByIp(ipAddress: string): Promise<Device | undefined> {
    return Array.from(this.devices.values()).find(
      (device) => device.ipAddress === ipAddress
    );
  }

  async createDevice(insertDevice: InsertDevice): Promise<Device> {
    const id = this.deviceIdCounter++;
    const now = new Date();
    const device: Device = { 
      ...insertDevice, 
      id, 
      lastSeen: now, 
      isOnline: false,
      uptime: "0d 0h 0m",
      model: insertDevice.model || null,
      serialNumber: insertDevice.serialNumber || null,
      routerOsVersion: insertDevice.routerOsVersion || null,
      firmware: insertDevice.firmware || null,
      cpu: insertDevice.cpu || null,
      totalMemory: insertDevice.totalMemory || null,
      storage: insertDevice.storage || null,
      hasCAPsMAN: false,
      hasWireless: false
    };
    this.devices.set(id, device);
    return device;
  }

  async updateDevice(id: number, updateDevice: Partial<Device>): Promise<Device | undefined> {
    const device = this.devices.get(id);
    if (!device) return undefined;

    const updatedDevice = { ...device, ...updateDevice };
    this.devices.set(id, updatedDevice);
    return updatedDevice;
  }

  async deleteDevice(id: number): Promise<boolean> {
    return this.devices.delete(id);
  }

  // Metric operations
  async getMetrics(deviceId: number, limit?: number): Promise<Metric[]> {
    const allDeviceMetrics = Array.from(this.metrics.values())
      .filter((metric) => metric.deviceId === deviceId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    if (limit) {
      return allDeviceMetrics.slice(0, limit);
    }
    return allDeviceMetrics;
  }

  async createMetric(insertMetric: InsertMetric): Promise<Metric> {
    const id = this.metricIdCounter++;
    const metric: Metric = { 
      ...insertMetric, 
      id,
      timestamp: insertMetric.timestamp || new Date(),
      cpuUsage: insertMetric.cpuUsage || null,
      memoryUsage: insertMetric.memoryUsage || null,
      totalMemory: insertMetric.totalMemory || null,
      temperature: insertMetric.temperature || null,
      uploadBandwidth: insertMetric.uploadBandwidth || null,
      downloadBandwidth: insertMetric.downloadBandwidth || null,
      boardTemp: insertMetric.boardTemp || null
    };
    this.metrics.set(id, metric);
    return metric;
  }

  // Interface operations
  async getInterfaces(deviceId: number): Promise<Interface[]> {
    return Array.from(this.interfaces.values())
      .filter((iface) => iface.deviceId === deviceId);
  }

  async getInterface(id: number): Promise<Interface | undefined> {
    return this.interfaces.get(id);
  }

  async createInterface(insertInterface: InsertInterface): Promise<Interface> {
    const id = this.interfaceIdCounter++;
    const iface: Interface = { 
      ...insertInterface, 
      id,
      name: insertInterface.name,
      deviceId: insertInterface.deviceId,
      type: insertInterface.type || null,
      speed: insertInterface.speed || null,
      isUp: insertInterface.isUp || null,
      macAddress: insertInterface.macAddress || null,
      txBytes: insertInterface.txBytes || null,
      rxBytes: insertInterface.rxBytes || null,
      lastUpdated: insertInterface.lastUpdated || new Date()
    };
    this.interfaces.set(id, iface);
    return iface;
  }

  async updateInterface(id: number, updateInterface: Partial<Interface>): Promise<Interface | undefined> {
    const iface = this.interfaces.get(id);
    if (!iface) return undefined;

    const updatedInterface = { ...iface, ...updateInterface };
    this.interfaces.set(id, updatedInterface);
    return updatedInterface;
  }

  // Alert operations
  async getAlerts(deviceId?: number, acknowledged?: boolean, limit?: number): Promise<Alert[]> {
    let filteredAlerts = Array.from(this.alerts.values());
    
    if (deviceId !== undefined) {
      filteredAlerts = filteredAlerts.filter(alert => alert.deviceId === deviceId);
    }
    
    if (acknowledged !== undefined) {
      filteredAlerts = filteredAlerts.filter(alert => alert.acknowledged === acknowledged);
    }
    
    // Sort by timestamp, most recent first
    filteredAlerts.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    if (limit) {
      return filteredAlerts.slice(0, limit);
    }
    
    return filteredAlerts;
  }

  async createAlert(insertAlert: InsertAlert): Promise<Alert> {
    const id = this.alertIdCounter++;
    const alert: Alert = { 
      ...insertAlert, 
      id, 
      acknowledged: false,
      deviceId: insertAlert.deviceId,
      severity: insertAlert.severity,
      message: insertAlert.message,
      timestamp: insertAlert.timestamp || new Date(),
      source: insertAlert.source || null
    };
    this.alerts.set(id, alert);
    return alert;
  }

  async acknowledgeAlert(id: number): Promise<Alert | undefined> {
    const alert = this.alerts.get(id);
    if (!alert) return undefined;

    const acknowledgedAlert = { ...alert, acknowledged: true };
    this.alerts.set(id, acknowledgedAlert);
    return acknowledgedAlert;
  }

  async acknowledgeAllAlerts(deviceId?: number): Promise<number> {
    let count = 0;
    const alerts = await this.getAlerts(deviceId, false);
    
    for (const alert of alerts) {
      await this.acknowledgeAlert(alert.id);
      count++;
    }
    
    return count;
  }

  // Wireless Interface operations
  async getWirelessInterfaces(deviceId: number): Promise<WirelessInterface[]> {
    return Array.from(this.wirelessInterfaces.values())
      .filter((wifiInterface) => wifiInterface.deviceId === deviceId);
  }

  async getWirelessInterface(id: number): Promise<WirelessInterface | undefined> {
    return this.wirelessInterfaces.get(id);
  }

  async createWirelessInterface(insertWirelessInterface: InsertWirelessInterface): Promise<WirelessInterface> {
    const id = this.wirelessInterfaceIdCounter++;
    const wifiInterface: WirelessInterface = { 
      ...insertWirelessInterface, 
      id,
      name: insertWirelessInterface.name,
      deviceId: insertWirelessInterface.deviceId,
      interfaceId: insertWirelessInterface.interfaceId || null,
      macAddress: insertWirelessInterface.macAddress || null,
      ssid: insertWirelessInterface.ssid || null,
      band: insertWirelessInterface.band || null,
      channel: insertWirelessInterface.channel || null,
      frequency: insertWirelessInterface.frequency || null,
      noiseFloor: insertWirelessInterface.noiseFloor || null,
      txPower: insertWirelessInterface.txPower || null,
      signalStrength: insertWirelessInterface.signalStrength || null,
      mode: insertWirelessInterface.mode || null,
      clients: insertWirelessInterface.clients || 0,
      isActive: insertWirelessInterface.isActive !== undefined ? insertWirelessInterface.isActive : true,
      lastUpdated: new Date()
    };
    this.wirelessInterfaces.set(id, wifiInterface);
    return wifiInterface;
  }

  async updateWirelessInterface(id: number, updateInterface: Partial<WirelessInterface>): Promise<WirelessInterface | undefined> {
    const wifiInterface = this.wirelessInterfaces.get(id);
    if (!wifiInterface) return undefined;

    const updatedWirelessInterface = { ...wifiInterface, ...updateInterface };
    this.wirelessInterfaces.set(id, updatedWirelessInterface);
    return updatedWirelessInterface;
  }

  async deleteWirelessInterface(id: number): Promise<boolean> {
    return this.wirelessInterfaces.delete(id);
  }

  // CAPsMAN AP operations
  async getCapsmanAPs(deviceId: number): Promise<CapsmanAP[]> {
    return Array.from(this.capsmanAPs.values())
      .filter((ap) => ap.deviceId === deviceId);
  }

  async getCapsmanAP(id: number): Promise<CapsmanAP | undefined> {
    return this.capsmanAPs.get(id);
  }

  async createCapsmanAP(insertCapsmanAP: InsertCapsmanAP): Promise<CapsmanAP> {
    const id = this.capsmanAPIdCounter++;
    const capsmanAP: CapsmanAP = { 
      ...insertCapsmanAP, 
      id,
      deviceId: insertCapsmanAP.deviceId,
      name: insertCapsmanAP.name,
      macAddress: insertCapsmanAP.macAddress,
      identity: insertCapsmanAP.identity || null,
      model: insertCapsmanAP.model || null,
      serialNumber: insertCapsmanAP.serialNumber || null,
      version: insertCapsmanAP.version || null,
      radioName: insertCapsmanAP.radioName || null,
      radioMac: insertCapsmanAP.radioMac || null,
      state: insertCapsmanAP.state || null,
      ipAddress: insertCapsmanAP.ipAddress || null,
      clients: insertCapsmanAP.clients || 0,
      uptime: insertCapsmanAP.uptime || null,
      lastSeen: new Date()
    };
    this.capsmanAPs.set(id, capsmanAP);
    return capsmanAP;
  }

  async updateCapsmanAP(id: number, updateAP: Partial<CapsmanAP>): Promise<CapsmanAP | undefined> {
    const capsmanAP = this.capsmanAPs.get(id);
    if (!capsmanAP) return undefined;

    const updatedCapsmanAP = { ...capsmanAP, ...updateAP };
    this.capsmanAPs.set(id, updatedCapsmanAP);
    return updatedCapsmanAP;
  }

  async deleteCapsmanAP(id: number): Promise<boolean> {
    return this.capsmanAPs.delete(id);
  }
  
  // CAPsMAN Client operations
  async getCapsmanClients(apId: number): Promise<CapsmanClient[]> {
    return Array.from(this.capsmanClients.values())
      .filter((client) => client.apId === apId);
  }

  async getCapsmanClientsByDevice(deviceId: number): Promise<CapsmanClient[]> {
    return Array.from(this.capsmanClients.values())
      .filter((client) => client.deviceId === deviceId);
  }

  async getCapsmanClient(id: number): Promise<CapsmanClient | undefined> {
    return this.capsmanClients.get(id);
  }

  async createCapsmanClient(insertCapsmanClient: InsertCapsmanClient): Promise<CapsmanClient> {
    const id = this.capsmanClientIdCounter++;
    const capsmanClient: CapsmanClient = { 
      ...insertCapsmanClient, 
      id,
      apId: insertCapsmanClient.apId,
      deviceId: insertCapsmanClient.deviceId,
      macAddress: insertCapsmanClient.macAddress,
      ipAddress: insertCapsmanClient.ipAddress || null,
      hostname: insertCapsmanClient.hostname || null,
      signalStrength: insertCapsmanClient.signalStrength || null,
      txRate: insertCapsmanClient.txRate || null,
      rxRate: insertCapsmanClient.rxRate || null,
      connectedTime: insertCapsmanClient.connectedTime || null,
      username: insertCapsmanClient.username || null,
      interface: insertCapsmanClient.interface || null,
      lastActivity: new Date()
    };
    this.capsmanClients.set(id, capsmanClient);
    return capsmanClient;
  }

  async updateCapsmanClient(id: number, updateClient: Partial<CapsmanClient>): Promise<CapsmanClient | undefined> {
    const capsmanClient = this.capsmanClients.get(id);
    if (!capsmanClient) return undefined;

    const updatedCapsmanClient = { ...capsmanClient, ...updateClient };
    this.capsmanClients.set(id, updatedCapsmanClient);
    return updatedCapsmanClient;
  }

  async deleteCapsmanClient(id: number): Promise<boolean> {
    return this.capsmanClients.delete(id);
  }
}

export const storage = new MemStorage();
