import { mikrotikService } from "./mikrotik";
import { storage } from "../storage";
import { alertSeverity } from "@shared/schema";

// Cấu hình cho scheduler
interface SchedulerConfig {
  pollingInterval: number;      // Thời gian giữa các lần polling (ms)
  requestTimeout: number;       // Thời gian timeout cho mỗi thiết bị (ms)
  maxConcurrentRequests: number; // Số lượng thiết bị tối đa có thể polling cùng lúc
  maxRetries: number;           // Số lần thử lại tối đa khi lỗi
  retryDelay: number;           // Thời gian chờ giữa các lần thử lại (ms)
}

// Lưu trữ trạng thái polling của thiết bị
interface DevicePollingState {
  deviceId: number;
  deviceName: string;
  lastPolled: Date | null;
  consecutiveFailures: number;
  isPolling: boolean;
  lastError: string | null;
}

class SchedulerService {
  private intervalId?: NodeJS.Timeout;
  private config: SchedulerConfig = {
    pollingInterval: 10000,      // 10 giây - tần suất cao cho cập nhật real-time
    requestTimeout: 30000,       // 30 giây timeout
    maxConcurrentRequests: 5,    // Tối đa 5 thiết bị cùng lúc
    maxRetries: 3,               // Thử lại 3 lần khi lỗi
    retryDelay: 5000             // Chờ 5 giây giữa các lần thử lại
  };
  
  // Lưu trạng thái polling của các thiết bị theo deviceId
  private deviceStates: Map<number, DevicePollingState> = new Map();
  
  // Đếm số lượng polling đang thực hiện
  private activePollCount: number = 0;

  // Khởi động scheduler
  start() {
    if (this.intervalId) {
      return;
    }

    console.log(`Starting device polling scheduler (interval: ${this.config.pollingInterval}ms)`);
    this.intervalId = setInterval(this.pollDevices.bind(this), this.config.pollingInterval);
    
    // Poll devices immediately on start
    this.pollDevices();
  }

  // Dừng scheduler
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
      console.log("Stopped device polling scheduler");
    }
  }

  // Cập nhật cấu hình polling interval
  setPollingInterval(milliseconds: number) {
    if (milliseconds < 5000) {
      console.warn("Polling interval cannot be less than 5 seconds");
      milliseconds = 5000;
    }
    
    this.config.pollingInterval = milliseconds;
    
    // Restart polling with new interval if already running
    if (this.intervalId) {
      this.stop();
      this.start();
    }
    
    console.log(`Updated polling interval to ${milliseconds}ms`);
  }
  
  // Cập nhật cấu hình số lượng thiết bị tối đa cùng lúc
  setMaxConcurrentDevices(count: number) {
    if (count < 1) {
      console.warn("Max concurrent devices cannot be less than 1");
      count = 1;
    }
    
    this.config.maxConcurrentRequests = count;
    console.log(`Updated max concurrent devices to ${count}`);
  }

  // Hàm chính để polling thiết bị
  async pollDevices() {
    try {
      // Lấy danh sách thiết bị
      const devices = await storage.getAllDevices();
      console.log(`Polling ${devices.length} devices...`);
      
      // Khởi tạo hoặc cập nhật trạng thái thiết bị nếu chưa có
      for (const device of devices) {
        if (!this.deviceStates.has(device.id)) {
          this.deviceStates.set(device.id, {
            deviceId: device.id,
            deviceName: device.name,
            lastPolled: null,
            consecutiveFailures: 0,
            isPolling: false,
            lastError: null
          });
        } else {
          // Cập nhật tên thiết bị nếu đã thay đổi
          const state = this.deviceStates.get(device.id)!;
          state.deviceName = device.name;
        }
      }
      
      // Lọc các thiết bị chưa đang được polling
      const availableDevices = devices.filter(
        device => !this.deviceStates.get(device.id)?.isPolling
      );
      
      // Số lượng thiết bị có thể thêm vào để polling
      const availableSlots = Math.max(0, this.config.maxConcurrentRequests - this.activePollCount);
      
      if (availableSlots > 0 && availableDevices.length > 0) {
        // Ưu tiên thiết bị chưa được polling hoặc lâu nhất chưa được polling
        const devicesToProcess = availableDevices
          .sort((a, b) => {
            const stateA = this.deviceStates.get(a.id)!;
            const stateB = this.deviceStates.get(b.id)!;
            
            if (!stateA.lastPolled && !stateB.lastPolled) return 0;
            if (!stateA.lastPolled) return -1;
            if (!stateB.lastPolled) return 1;
            
            return stateA.lastPolled.getTime() - stateB.lastPolled.getTime();
          })
          .slice(0, availableSlots);
        
        // Xử lý từng thiết bị song song
        for (const device of devicesToProcess) {
          this.pollDevice(device.id, 0); // Bắt đầu với số lần thử = 0
        }
      }
    } catch (error) {
      console.error("Error in device polling scheduler:", error);
    }
  }
  
  // Hàm xử lý polling cho một thiết bị
  private async pollDevice(deviceId: number, retryCount: number) {
    const state = this.deviceStates.get(deviceId);
    if (!state) return;
    
    // Đánh dấu thiết bị đang được polling
    state.isPolling = true;
    this.activePollCount++;
    
    try {
      // Thiết lập timeout
      const timeout = new Promise<void>((_, reject) => {
        setTimeout(() => reject(new Error("Device polling timed out")), this.config.requestTimeout);
      });
      
      // Thực hiện thu thập metrics
      await Promise.race([
        mikrotikService.collectDeviceMetrics(deviceId),
        timeout
      ]);
      
      // Cập nhật trạng thái thành công
      state.lastPolled = new Date();
      state.consecutiveFailures = 0;
      state.lastError = null;
      
      // Tạo cảnh báo nếu thiết bị trước đó lỗi và giờ đã kết nối lại
      if (state.consecutiveFailures > 0) {
        await mikrotikService.createAlert(
          deviceId,
          alertSeverity.INFO,
          "Device reconnected",
          `Reconnected to device ${state.deviceName} after ${state.consecutiveFailures} failed attempts`
        );
      }
    } catch (error) {
      // Xử lý lỗi
      const errorMessage = error instanceof Error ? error.message : String(error);
      state.consecutiveFailures++;
      state.lastError = errorMessage;
      
      console.error(`Error polling device ${deviceId} (${state.deviceName}):`, errorMessage);
      
      // Thử lại nếu chưa đạt giới hạn
      if (retryCount < this.config.maxRetries) {
        console.log(`Retrying device ${deviceId} (${state.deviceName}) in ${this.config.retryDelay}ms (attempt ${retryCount + 1}/${this.config.maxRetries})`);
        
        // Đặt timeout để thử lại
        setTimeout(() => {
          // Giảm activePollCount để không đếm trùng
          this.activePollCount--;
          state.isPolling = false;
          
          this.pollDevice(deviceId, retryCount + 1);
        }, this.config.retryDelay);
        
        return;
      }
      
      // Thiết bị vẫn lỗi sau nhiều lần thử, tạo cảnh báo
      await mikrotikService.createAlert(
        deviceId,
        alertSeverity.WARNING,
        "Device connection failed",
        `Failed to connect to device ${state.deviceName} after ${this.config.maxRetries} attempts: ${errorMessage}`
      );
      
      // Cập nhật trạng thái thiết bị thành offline
      await storage.updateDevice(deviceId, { isOnline: false });
    } finally {
      // Nếu không thử lại nữa, giải phóng slot
      if (retryCount >= this.config.maxRetries) {
        state.isPolling = false;
        this.activePollCount--;
      }
    }
  }
  
  // Lấy trạng thái polling của các thiết bị
  getDevicePollingStatus() {
    return Array.from(this.deviceStates.values());
  }
}

export const schedulerService = new SchedulerService();
