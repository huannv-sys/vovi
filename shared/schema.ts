import { pgTable, text, serial, integer, boolean, timestamp, jsonb, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Device table - stores information about Mikrotik devices
export const devices = pgTable("devices", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  ipAddress: text("ip_address").notNull(),
  username: text("username").notNull(),
  password: text("password").notNull(),
  model: text("model"),
  serialNumber: text("serial_number"),
  routerOsVersion: text("router_os_version"),
  firmware: text("firmware"),
  cpu: text("cpu"),
  totalMemory: text("total_memory"),
  storage: text("storage"),
  lastSeen: timestamp("last_seen"),
  isOnline: boolean("is_online").default(false),
  uptime: text("uptime"),
});

export const insertDeviceSchema = createInsertSchema(devices).omit({
  id: true,
  lastSeen: true,
  isOnline: true,
  uptime: true,
});

// Metrics table - stores time-series performance metrics
export const metrics = pgTable("metrics", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id").notNull(),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  cpuUsage: real("cpu_usage"),
  memoryUsage: real("memory_usage"),
  totalMemory: real("total_memory"),
  temperature: real("temperature"),
  uploadBandwidth: real("upload_bandwidth"),
  downloadBandwidth: real("download_bandwidth"),
});

export const insertMetricSchema = createInsertSchema(metrics).omit({
  id: true,
});

// Interfaces table - stores information about network interfaces
export const interfaces = pgTable("interfaces", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id").notNull(),
  name: text("name").notNull(),
  type: text("type"),
  speed: text("speed"),
  isUp: boolean("is_up").default(false),
  macAddress: text("mac_address"),
  txBytes: real("tx_bytes").default(0),
  rxBytes: real("rx_bytes").default(0),
  lastUpdated: timestamp("last_updated").defaultNow(),
});

export const insertInterfaceSchema = createInsertSchema(interfaces).omit({
  id: true,
});

// Alerts table - stores system alerts
export const alerts = pgTable("alerts", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id").notNull(),
  severity: text("severity").notNull(), // error, warning, info
  message: text("message").notNull(),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  acknowledged: boolean("acknowledged").default(false),
  source: text("source"),
});

export const insertAlertSchema = createInsertSchema(alerts).omit({
  id: true,
  acknowledged: true,
});

// Alert Types (for frontend display)
export const alertSeverity = {
  ERROR: "error",
  WARNING: "warning",
  INFO: "info",
} as const;

// Type definitions
export type Device = typeof devices.$inferSelect;
export type InsertDevice = z.infer<typeof insertDeviceSchema>;
export type Metric = typeof metrics.$inferSelect;
export type InsertMetric = z.infer<typeof insertMetricSchema>;
export type Interface = typeof interfaces.$inferSelect;
export type InsertInterface = z.infer<typeof insertInterfaceSchema>;
export type Alert = typeof alerts.$inferSelect;
export type InsertAlert = z.infer<typeof insertAlertSchema>;
export type AlertSeverity = typeof alertSeverity[keyof typeof alertSeverity];
