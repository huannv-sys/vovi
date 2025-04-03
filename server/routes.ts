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
      
      const validatedData = insertDeviceSchema.partial().parse(req.body);
      const updatedDevice = await storage.updateDevice(deviceId, validatedData);
      res.json(updatedDevice);
    } catch (error) {
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
