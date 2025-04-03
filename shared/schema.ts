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
  hasCAPsMAN: boolean("has_capsman").default(false),
  hasWireless: boolean("has_wireless").default(false),
});

export const insertDeviceSchema = createInsertSchema(devices).omit({
  id: true,
  lastSeen: true,
  isOnline: true,
  uptime: true,
  hasCAPsMAN: true,
  hasWireless: true,
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
  boardTemp: real("board_temp"),
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

// Wireless Interfaces table - stores information about wireless interfaces
export const wirelessInterfaces = pgTable("wireless_interfaces", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id").notNull(),
  interfaceId: integer("interface_id"),
  name: text("name").notNull(),
  macAddress: text("mac_address"),
  ssid: text("ssid"),
  band: text("band"), // 2ghz-b/g/n, 5ghz-a/n/ac
  channel: text("channel"),
  frequency: integer("frequency"),
  noiseFloor: integer("noise_floor"),
  txPower: real("tx_power"),
  signalStrength: real("signal_strength"),
  mode: text("mode"), // ap, station, bridge
  clients: integer("clients").default(0),
  isActive: boolean("is_active").default(true),
  lastUpdated: timestamp("last_updated").defaultNow(),
});

export const insertWirelessInterfaceSchema = createInsertSchema(wirelessInterfaces).omit({
  id: true,
  lastUpdated: true,
});

// CAPsMAN Access Points table - stores information about CAPsMAN managed APs
export const capsmanAPs = pgTable("capsman_aps", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id").notNull(), // Controller device ID
  name: text("name").notNull(),
  macAddress: text("mac_address").notNull(),
  identity: text("identity"),
  model: text("model"),
  serialNumber: text("serial_number"),
  version: text("version"),
  radioName: text("radio_name"),
  radioMac: text("radio_mac"),
  state: text("state"), // running, disabled, etc.
  ipAddress: text("ip_address"),
  clients: integer("clients").default(0),
  uptime: text("uptime"),
  lastSeen: timestamp("last_seen").defaultNow(),
});

export const insertCapsmanAPSchema = createInsertSchema(capsmanAPs).omit({
  id: true,
  lastSeen: true,
});

// Type definitions
export type Device = typeof devices.$inferSelect;
export type InsertDevice = z.infer<typeof insertDeviceSchema>;
export type Metric = typeof metrics.$inferSelect;
export type InsertMetric = z.infer<typeof insertMetricSchema>;
export type Interface = typeof interfaces.$inferSelect;
export type InsertInterface = z.infer<typeof insertInterfaceSchema>;
export type Alert = typeof alerts.$inferSelect;
export type InsertAlert = z.infer<typeof insertAlertSchema>;
export type WirelessInterface = typeof wirelessInterfaces.$inferSelect;
export type InsertWirelessInterface = z.infer<typeof insertWirelessInterfaceSchema>;
export type CapsmanAP = typeof capsmanAPs.$inferSelect;
export type InsertCapsmanAP = z.infer<typeof insertCapsmanAPSchema>;
export type AlertSeverity = typeof alertSeverity[keyof typeof alertSeverity];
