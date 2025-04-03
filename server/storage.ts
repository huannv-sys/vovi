import {
  type Device,
  type InsertDevice,
  type Metric,
  type InsertMetric,
  type Interface,
  type InsertInterface,
  type Alert,
  type InsertAlert,
  devices,
  metrics,
  interfaces,
  alerts,
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
}

export class MemStorage implements IStorage {
  private devices: Map<number, Device>;
  private metrics: Map<number, Metric>;
  private interfaces: Map<number, Interface>;
  private alerts: Map<number, Alert>;
  private deviceIdCounter: number;
  private metricIdCounter: number;
  private interfaceIdCounter: number;
  private alertIdCounter: number;

  constructor() {
    this.devices = new Map();
    this.metrics = new Map();
    this.interfaces = new Map();
    this.alerts = new Map();
    this.deviceIdCounter = 1;
    this.metricIdCounter = 1;
    this.interfaceIdCounter = 1;
    this.alertIdCounter = 1;

    // Add sample device for initial testing
    this.createDevice({
      name: "MikroTik Router - Office Main",
      ipAddress: "192.168.1.1",
      username: "admin",
      password: "password",
      model: "RB4011iGS+5HacQ2HnD-IN",
      serialNumber: "CC47086F277A",
      routerOsVersion: "7.8 (stable)",
      firmware: "6.49.6",
      cpu: "4-core ARMv7",
      totalMemory: "1 GB",
      storage: "16 GB Flash",
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
      uptime: "0d 0h 0m"
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
    const metric: Metric = { ...insertMetric, id };
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
    const iface: Interface = { ...insertInterface, id };
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
    const alert: Alert = { ...insertAlert, id, acknowledged: false };
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
}

export const storage = new MemStorage();
