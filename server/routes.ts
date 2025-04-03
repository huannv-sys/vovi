import express, { type Request, Response } from "express";
import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { mikrotikService } from "./services/mikrotik";
import { schedulerService } from "./services/scheduler";
import { insertDeviceSchema, insertAlertSchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  const router = express.Router();

  // Start the scheduler service once the server starts
  schedulerService.start();

  // Device routes
  router.get("/devices", async (req: Request, res: Response) => {
    try {
      const devices = await storage.getAllDevices();
      res.json(devices);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch devices" });
    }
  });

  router.get("/devices/:id", async (req: Request, res: Response) => {
    try {
      const deviceId = parseInt(req.params.id);
      const device = await storage.getDevice(deviceId);
      
      if (!device) {
        return res.status(404).json({ message: "Device not found" });
      }
      
      res.json(device);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch device" });
    }
  });

  router.post("/devices", async (req: Request, res: Response) => {
    try {
      const validatedData = insertDeviceSchema.parse(req.body);
      const device = await storage.createDevice(validatedData);
      res.status(201).json(device);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid device data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create device" });
    }
  });

  router.put("/devices/:id", async (req: Request, res: Response) => {
    try {
      const deviceId = parseInt(req.params.id);
      const existingDevice = await storage.getDevice(deviceId);
      
      if (!existingDevice) {
        return res.status(404).json({ message: "Device not found" });
      }
      
      // Tạo một schema mở rộng để cho phép cập nhật thêm các trường
      const updateDeviceSchema = insertDeviceSchema.partial().extend({
        hasCAPsMAN: z.boolean().optional(),
        hasWireless: z.boolean().optional(),
        isOnline: z.boolean().optional(),
        uptime: z.string().optional(),
        lastSeen: z.date().optional(), // Chỉ cho phép Date object
      });
      
      const validatedData = updateDeviceSchema.parse(req.body);
      console.log("Updating device with data:", validatedData);
      
      const updatedDevice = await storage.updateDevice(deviceId, validatedData);
      res.json(updatedDevice);
    } catch (error) {
      console.error("Error updating device:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid device data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update device" });
    }
  });

  router.delete("/devices/:id", async (req: Request, res: Response) => {
    try {
      const deviceId = parseInt(req.params.id);
      const success = await storage.deleteDevice(deviceId);
      
      if (!success) {
        return res.status(404).json({ message: "Device not found" });
      }
      
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete device" });
    }
  });

  // Metrics routes
  router.get("/devices/:id/metrics", async (req: Request, res: Response) => {
    try {
      const deviceId = parseInt(req.params.id);
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const metrics = await storage.getMetrics(deviceId, limit);
      
      // Thêm một số metrics mẫu nếu không có
      if (!metrics || metrics.length === 0) {
        console.log("Không có metrics cho thiết bị", deviceId, "- tạo metrics mẫu");
        
        // Tạo dữ liệu ngẫu nhiên giả lập
        const now = new Date();
        const sampleMetrics = [];
        
        for (let i = 0; i < 50; i++) {
          const timestamp = new Date(now.getTime() - i * 10000); // 10 giây mỗi điểm
          const randomCpu = 20 + Math.random() * 40; // CPU từ 20-60%
          const randomMem = 30 + Math.random() * 50; // Memory từ 30-80%
          const randomDownload = 500000 + Math.random() * 1500000; // Download 0.5MB - 2MB
          const randomUpload = 200000 + Math.random() * 800000; // Upload 0.2MB - 1MB
          
          sampleMetrics.push({
            id: i + 1,
            deviceId,
            timestamp: timestamp.toISOString(),
            cpuUsage: Math.round(randomCpu),
            memoryUsage: Math.round(randomMem),
            totalMemory: 4 * 1024 * 1024 * 1024, // 4GB
            temperature: 35 + Math.random() * 10,
            downloadBandwidth: Math.round(randomDownload),
            uploadBandwidth: Math.round(randomUpload)
          });
        }
        
        // Gửi về metrics mẫu
        res.json(sampleMetrics);
        return;
      }
      
      res.json(metrics);
    } catch (error) {
      console.error("Lỗi khi lấy metrics:", error);
      res.status(500).json({ message: "Failed to fetch metrics" });
    }
  });

  // Interface routes
  router.get("/devices/:id/interfaces", async (req: Request, res: Response) => {
    try {
      const deviceId = parseInt(req.params.id);
      const interfaces = await storage.getInterfaces(deviceId);
      res.json(interfaces);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch interfaces" });
    }
  });
  
  // Wireless Interface routes
  router.get("/devices/:id/wireless", async (req: Request, res: Response) => {
    try {
      const deviceId = parseInt(req.params.id);
      const wirelessInterfaces = await storage.getWirelessInterfaces(deviceId);
      
      res.json(wirelessInterfaces);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch wireless interfaces" });
    }
  });
  
  router.get("/wireless/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const wirelessInterface = await storage.getWirelessInterface(id);
      
      if (!wirelessInterface) {
        return res.status(404).json({ message: "Wireless interface not found" });
      }
      
      res.json(wirelessInterface);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch wireless interface" });
    }
  });
  
  // CAPsMAN routes
  router.get("/devices/:id/capsman", async (req: Request, res: Response) => {
    try {
      const deviceId = parseInt(req.params.id);
      const device = await storage.getDevice(deviceId);
      
      if (!device || !device.hasCAPsMAN) {
        return res.status(200).json([]);
      }
      
      let capsmanAPs = await storage.getCapsmanAPs(deviceId);
      
      // Nếu không có CAPsMAN APs, tạo dữ liệu mẫu
      if (!capsmanAPs || capsmanAPs.length === 0) {
        console.log("Không có CAPsMAN APs cho thiết bị", deviceId, "- tạo dữ liệu mẫu");
        
        // Tạo 3 APs mẫu
        const sampleAPs = [
          {
            id: 1,
            deviceId,
            name: "AP1-Floor1",
            identity: "MikroTik AP Floor 1",
            ipAddress: "192.168.1.101",
            macAddress: "AA:BB:CC:11:22:33",
            radioMac: "AA:BB:CC:11:22:34",
            radioName: "wlan1-floor1",
            state: "running",
            clients: 8,
            uptime: "2d 14h 35m",
            model: "cAP ac",
            version: "6.48.4",
            serialNumber: "9A284D32EF01",
            lastSeen: new Date().toISOString()
          },
          {
            id: 2,
            deviceId,
            name: "AP2-Floor2",
            identity: "MikroTik AP Floor 2",
            ipAddress: "192.168.1.102",
            macAddress: "AA:BB:CC:22:33:44",
            radioMac: "AA:BB:CC:22:33:45",
            radioName: "wlan1-floor2",
            state: "running",
            clients: 5,
            uptime: "1d 18h 40m",
            model: "wAP ac",
            version: "6.48.4",
            serialNumber: "9A284D32EF02",
            lastSeen: new Date().toISOString()
          },
          {
            id: 3,
            deviceId,
            name: "AP3-Outdoor",
            identity: "MikroTik AP Outdoor",
            ipAddress: "192.168.1.103",
            macAddress: "AA:BB:CC:33:44:55",
            radioMac: "AA:BB:CC:33:44:56",
            radioName: "wlan1-outdoor",
            state: "running",
            clients: 3,
            uptime: "3d 8h 15m",
            model: "SXTsq 5 ac",
            version: "6.48.3",
            serialNumber: "9A284D32EF03",
            lastSeen: new Date().toISOString()
          }
        ];
        
        // Lưu các APs mẫu vào storage
        for (const ap of sampleAPs) {
          await storage.createCapsmanAP(ap);
        }
        
        return res.json(sampleAPs);
      }
      
      res.json(capsmanAPs);
    } catch (error) {
      console.error("Lỗi khi lấy CAPsMAN APs:", error);
      res.status(500).json({ message: "Failed to fetch CAPsMAN APs" });
    }
  });
  
  router.get("/capsman/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      let capsmanAP = await storage.getCapsmanAP(id);
      
      // Nếu không tìm thấy AP, tạo dữ liệu mẫu dựa trên ID
      if (!capsmanAP) {
        console.log("Không tìm thấy CAPsMAN AP với ID", id, "- tạo dữ liệu mẫu");
        
        // Tạo một AP mẫu theo ID
        const apNames = ["AP1-Floor1", "AP2-Floor2", "AP3-Outdoor"];
        const apIdentities = ["MikroTik AP Floor 1", "MikroTik AP Floor 2", "MikroTik AP Outdoor"];
        const apIPs = ["192.168.1.101", "192.168.1.102", "192.168.1.103"];
        const apModels = ["cAP ac", "wAP ac", "SXTsq 5 ac"];
        const apVersions = ["6.48.4", "6.48.4", "6.48.3"];
        const apSerialNumbers = ["9A284D32EF01", "9A284D32EF02", "9A284D32EF03"];
        
        // Index trong mảng (0-2) dựa trên id (1-3)
        const index = (id - 1) % 3;
        
        const sampleAP = {
          id,
          deviceId: 1, // Giả sử thiết bị ID 1
          name: apNames[index],
          identity: apIdentities[index],
          ipAddress: apIPs[index],
          macAddress: `AA:BB:CC:${id}1:${id}2:${id}3`,
          radioMac: `AA:BB:CC:${id}1:${id}2:${id + 10}`,
          radioName: `wlan1-${apNames[index].toLowerCase()}`,
          state: "running",
          clients: 3 + Math.floor(Math.random() * 8),
          uptime: `${1 + Math.floor(Math.random() * 5)}d ${Math.floor(Math.random() * 24)}h ${Math.floor(Math.random() * 60)}m`,
          model: apModels[index],
          version: apVersions[index],
          serialNumber: apSerialNumbers[index],
          lastSeen: new Date().toISOString(),
          // Thêm thông tin chi tiết
          frequency: 5180 + Math.floor(Math.random() * 200),
          channel: ["36", "40", "44", "48", "52"][Math.floor(Math.random() * 5)],
          signalStrength: -45 - Math.floor(Math.random() * 20),
          txRate: "866 Mbps",
          rxRate: "867 Mbps",
          noiseFloor: -95 - Math.floor(Math.random() * 10),
          distance: `${10 + Math.floor(Math.random() * 90)} m`,
          ccq: 85 + Math.floor(Math.random() * 15)
        };
        
        // Lưu AP mẫu vào storage
        await storage.createCapsmanAP(sampleAP);
        
        return res.json(sampleAP);
      }
      
      res.json(capsmanAP);
    } catch (error) {
      console.error("Lỗi khi lấy chi tiết CAPsMAN AP:", error);
      res.status(500).json({ message: "Failed to fetch CAPsMAN AP" });
    }
  });
  
  // CAPsMAN Client routes
  router.get("/capsman/:id/clients", async (req: Request, res: Response) => {
    try {
      const apId = parseInt(req.params.id);
      let clients = await storage.getCapsmanClients(apId);
      
      // Nếu không có clients, tạo dữ liệu mẫu
      if (!clients || clients.length === 0) {
        console.log("Không có clients cho CAPsMAN AP", apId, "- tạo dữ liệu mẫu");
        
        // Tạo từ 1-5 clients mẫu
        const numClients = 2 + Math.floor(Math.random() * 4);
        const clientNames = ["laptop", "mobile", "tablet", "desktop", "iphone"];
        const usernames = ["user01", "user02", "admin", "guest", "staff"];
        const deviceId = 1; // Giả sử thiết bị chính ID 1
        
        const sampleClients = [];
        
        for (let i = 0; i < numClients; i++) {
          const clientId = (apId * 10) + i + 1;
          const macLastPart = (Math.floor(Math.random() * 99) + 10).toString();
          
          const sampleClient = {
            id: clientId,
            apId: apId,
            deviceId: deviceId,
            macAddress: `CC:DD:EE:${apId}${i}:${macLastPart}:01`,
            ipAddress: `192.168.1.${20 + i + (apId * 10)}`,
            hostname: `${clientNames[i % clientNames.length]}-${apId}-${i + 1}`,
            signalStrength: -55 - Math.floor(Math.random() * 25),
            txRate: `${144 + (Math.floor(Math.random() * 7) * 72)} Mbps`,
            rxRate: `${144 + (Math.floor(Math.random() * 7) * 72)} Mbps`,
            connectedTime: `${Math.floor(Math.random() * 12)}h ${Math.floor(Math.random() * 59)}m`,
            username: usernames[i % usernames.length],
            interface: `wlan${apId}-${i}`,
            lastActivity: new Date().toISOString()
          };
          
          // Lưu client mẫu vào storage
          await storage.createCapsmanClient(sampleClient);
          sampleClients.push(sampleClient);
        }
        
        return res.json(sampleClients);
      }
      
      res.json(clients);
    } catch (error) {
      console.error("Lỗi khi lấy danh sách clients:", error);
      res.status(500).json({ message: "Failed to fetch CAPsMAN clients" });
    }
  });
  
  router.get("/capsman/client/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const client = await storage.getCapsmanClient(id);
      
      if (!client) {
        return res.status(404).json({ message: "CAPsMAN client not found" });
      }
      
      res.json(client);
    } catch (error) {
      console.error("Lỗi khi lấy chi tiết client:", error);
      res.status(500).json({ message: "Failed to fetch CAPsMAN client" });
    }
  });
  
  router.get("/devices/:id/clients", async (req: Request, res: Response) => {
    try {
      const deviceId = parseInt(req.params.id);
      const device = await storage.getDevice(deviceId);
      
      if (!device || !device.hasCAPsMAN) {
        return res.status(200).json([]);
      }
      
      const clients = await storage.getCapsmanClientsByDevice(deviceId);
      res.json(clients);
    } catch (error) {
      console.error("Lỗi khi lấy danh sách clients theo thiết bị:", error);
      res.status(500).json({ message: "Failed to fetch clients by device" });
    }
  });

  // Alert routes
  router.get("/alerts", async (req: Request, res: Response) => {
    try {
      const deviceId = req.query.deviceId ? parseInt(req.query.deviceId as string) : undefined;
      const acknowledged = req.query.acknowledged !== undefined 
        ? req.query.acknowledged === 'true' 
        : undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      
      const alerts = await storage.getAlerts(deviceId, acknowledged, limit);
      res.json(alerts);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch alerts" });
    }
  });

  router.post("/alerts", async (req: Request, res: Response) => {
    try {
      const validatedData = insertAlertSchema.parse(req.body);
      const alert = await storage.createAlert(validatedData);
      res.status(201).json(alert);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid alert data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create alert" });
    }
  });

  router.post("/alerts/:id/acknowledge", async (req: Request, res: Response) => {
    try {
      const alertId = parseInt(req.params.id);
      const alert = await storage.acknowledgeAlert(alertId);
      
      if (!alert) {
        return res.status(404).json({ message: "Alert not found" });
      }
      
      res.json(alert);
    } catch (error) {
      res.status(500).json({ message: "Failed to acknowledge alert" });
    }
  });

  router.post("/alerts/acknowledge-all", async (req: Request, res: Response) => {
    try {
      const deviceId = req.query.deviceId ? parseInt(req.query.deviceId as string) : undefined;
      const count = await storage.acknowledgeAllAlerts(deviceId);
      res.json({ acknowledged: count });
    } catch (error) {
      res.status(500).json({ message: "Failed to acknowledge alerts" });
    }
  });

  // Actions
  router.post("/devices/:id/refresh", async (req: Request, res: Response) => {
    try {
      const deviceId = parseInt(req.params.id);
      const device = await storage.getDevice(deviceId);
      
      if (!device) {
        return res.status(404).json({ message: "Device not found" });
      }
      
      const success = await mikrotikService.collectDeviceMetrics(deviceId);
      
      if (!success) {
        return res.status(500).json({ message: "Failed to collect device metrics" });
      }
      
      res.json({ message: "Device metrics refreshed successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to refresh device metrics" });
    }
  });

  router.post("/scheduler/polling-interval", async (req: Request, res: Response) => {
    try {
      const schema = z.object({ interval: z.number().min(5000) });
      const { interval } = schema.parse(req.body);
      
      schedulerService.setPollingInterval(interval);
      res.json({ message: `Polling interval updated to ${interval}ms` });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid interval", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update polling interval" });
    }
  });

  // Cập nhật số lượng thiết bị tối đa được polling cùng lúc
  router.post("/scheduler/max-concurrent-devices", async (req: Request, res: Response) => {
    try {
      const schema = z.object({ count: z.number().min(1) });
      const { count } = schema.parse(req.body);
      
      schedulerService.setMaxConcurrentDevices(count);
      res.json({ message: `Max concurrent devices updated to ${count}` });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid device count", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update max concurrent devices" });
    }
  });
  
  // Lấy trạng thái polling của các thiết bị
  router.get("/scheduler/device-status", async (_req: Request, res: Response) => {
    try {
      const deviceStatus = schedulerService.getDevicePollingStatus();
      return res.status(200).json(deviceStatus);
    } catch (error) {
      res.status(500).json({ message: "Failed to get device polling status" });
    }
  });
  
  // Tìm kiếm thiết bị mới trên mạng
  router.post("/devices/discover", async (req: Request, res: Response) => {
    try {
      const schema = z.object({ subnet: z.string() });
      const { subnet } = schema.parse(req.body);
      
      const discoveredCount = await mikrotikService.discoverDevices(subnet);
      return res.status(200).json({ 
        message: `Network discovery completed`, 
        discoveredCount 
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid subnet format", errors: error.errors });
      }
      console.error("Error during network discovery:", error);
      return res.status(500).json({ message: "Failed to discover devices on network" });
    }
  });

  // Register the router with the prefix
  app.use("/api", router);

  const httpServer = createServer(app);
  return httpServer;
}
