#!/bin/bash

# Script khắc phục sự cố PM2 không khởi động ứng dụng đúng cách
# Tác giả: Expert Developer
# Phiên bản: 1.0
# -----------------------------------------------------------------------------

# Thiết lập môi trường
set -e
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color
APP_DIR="/opt/mikrotik-monitoring"
LOG_FILE="/var/log/mikrotik-monitor-pm2-fix.log"

# Tạo file log nếu chưa tồn tại
sudo mkdir -p $(dirname $LOG_FILE)
sudo touch $LOG_FILE
sudo chmod 666 $LOG_FILE

# Hàm ghi log
log() {
  echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a $LOG_FILE
}

# Hàm hiển thị lỗi
error() {
  echo -e "${RED}[ERROR] $1${NC}" | tee -a $LOG_FILE
  exit 1
}

# Hàm hiển thị banner
show_banner() {
  echo -e "${BLUE}"
  echo "╔════════════════════════════════════════════════════════════╗"
  echo "║            MIKROTIK MONITORING PM2 PORT FIX                ║"
  echo "║       Sửa lỗi PM2 không khởi động ứng dụng đúng cách       ║"
  echo "╚════════════════════════════════════════════════════════════╝"
  echo -e "${NC}"
}

# Kiểm tra PM2 logs
check_pm2_logs() {
  log "Kiểm tra PM2 logs để tìm lỗi..."
  
  if command -v pm2 &> /dev/null; then
    echo -e "\n${BLUE}=== THÔNG TIN PM2 STATUS ===${NC}"
    pm2 list
    
    echo -e "\n${BLUE}=== THÔNG TIN PM2 LOGS ===${NC}"
    pm2 logs --lines 20 mikrotik-monitor
    
    # Ghi log chi tiết
    pm2 logs --lines 100 mikrotik-monitor > /tmp/pm2_logs.txt
    log "Logs chi tiết đã được lưu vào /tmp/pm2_logs.txt"
  else
    error "PM2 không được cài đặt trên hệ thống"
  fi
}

# Dừng tất cả các tiến trình Node.js đang chạy
stop_node_processes() {
  log "Dừng tất cả các tiến trình Node.js đang chạy..."
  
  # Dừng các tiến trình PM2
  if command -v pm2 &> /dev/null; then
    pm2 stop all
    log "✓ Đã dừng tất cả các tiến trình PM2"
  fi
  
  # Dừng các tiến trình Node.js khác
  PIDS=$(ps aux | grep node | grep -v grep | awk '{print $2}')
  if [ -n "$PIDS" ]; then
    log "Tìm thấy các tiến trình Node.js sau: $PIDS"
    for PID in $PIDS; do
      sudo kill -15 $PID 2>/dev/null || true
      log "✓ Đã dừng tiến trình Node.js với PID $PID"
    done
  else
    log "Không tìm thấy tiến trình Node.js nào khác đang chạy"
  fi
  
  # Đợi các tiến trình kết thúc
  sleep 2
}

# Kiểm tra các ứng dụng lắng nghe trên cổng 5000
check_port_5000() {
  log "Kiểm tra các ứng dụng đang lắng nghe trên cổng 5000..."
  
  PORT_INFO=$(sudo netstat -tulpn | grep ":5000")
  if [ -n "$PORT_INFO" ]; then
    log "Cổng 5000 đang được sử dụng:"
    echo "$PORT_INFO"
    
    # Lấy PID từ thông tin cổng
    PID=$(echo "$PORT_INFO" | awk '{print $7}' | cut -d/ -f1)
    if [ -n "$PID" ]; then
      log "Tiến trình với PID $PID đang sử dụng cổng 5000"
      log "Thông tin chi tiết về tiến trình:"
      ps -p "$PID" -o pid,ppid,cmd,args
      
      echo -e "\n${YELLOW}Bạn có muốn dừng tiến trình này để giải phóng cổng 5000? (y/n)${NC}"
      read confirmation
      
      if [[ "$confirmation" == "y" || "$confirmation" == "Y" ]]; then
        sudo kill -15 "$PID" 2>/dev/null || sudo kill -9 "$PID" 2>/dev/null
        log "✓ Đã dừng tiến trình với PID $PID"
        sleep 1
      else
        log "Giữ nguyên tiến trình với PID $PID"
      fi
    fi
  else
    log "✓ Cổng 5000 chưa được sử dụng bởi bất kỳ ứng dụng nào"
  fi
}

# Tạo file khởi động mới
create_new_start_file() {
  log "Tạo file khởi động mới..."
  
  if [ -d "$APP_DIR" ]; then
    # Tạo script khởi động Node.js trực tiếp
    cat > "$APP_DIR/server.js" << 'EOF'
const express = require('express');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

// Simple middleware to log requests
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Check if we're in development or production mode
const isDev = process.env.NODE_ENV !== 'production';

if (isDev) {
  // In development mode, spawn the original dev server
  console.log('[Server] Starting in DEVELOPMENT mode');
  const child = exec('npm run dev', {
    cwd: __dirname,
    stdio: 'inherit'
  });
  
  child.stdout.on('data', (data) => {
    console.log(`[Dev Server] ${data}`);
  });
  
  child.stderr.on('data', (data) => {
    console.error(`[Dev Server Error] ${data}`);
  });
  
  child.on('close', (code) => {
    console.log(`[Dev Server] exited with code ${code}`);
  });
} else {
  // In production mode, serve static files
  console.log('[Server] Starting in PRODUCTION mode');
  
  // Serve static files from the 'dist' directory
  app.use(express.static(path.join(__dirname, 'dist')));
  
  // Define routes for your API
  app.get('/api/status', (req, res) => {
    res.json({ status: 'running', mode: 'production' });
  });
  
  // Catch-all route to serve index.html
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
}

// Start the server
app.listen(PORT, HOST, () => {
  console.log(`[Server] Running on http://${HOST}:${PORT}`);
  
  // Notify that server is running
  const message = `
╔════════════════════════════════════════════════════════════╗
║            MIKROTIK MONITORING SERVER RUNNING              ║
║                                                            ║
║  Server is running at: http://${HOST}:${PORT}                   ║
║  Mode: ${isDev ? 'DEVELOPMENT' : 'PRODUCTION'}                               ║
╚════════════════════════════════════════════════════════════╝
  `;
  console.log(message);
});
EOF
    
    # Tạo file khởi động PM2 mới
    cat > "$APP_DIR/pm2-start.js" << 'EOF'
const { exec } = require('child_process');
exec('node server.js', { stdio: 'inherit' });
EOF
    
    log "✓ Đã tạo file server.js và pm2-start.js"
  else
    error "Không tìm thấy thư mục ứng dụng $APP_DIR"
  fi
}

# Cấu hình PM2 khởi động lại
reconfigure_pm2() {
  log "Cấu hình lại PM2..."
  
  if [ -d "$APP_DIR" ]; then
    cd "$APP_DIR" || error "Không thể truy cập thư mục ứng dụng"
    
    # Dừng và xóa ứng dụng hiện tại nếu có
    if pm2 list | grep -q "mikrotik-monitor"; then
      pm2 delete mikrotik-monitor
      log "✓ Đã xóa ứng dụng mikrotik-monitor hiện tại từ PM2"
    fi
    
    # Khởi động ứng dụng mới
    pm2 start pm2-start.js --name mikrotik-monitor
    log "✓ Đã khởi động ứng dụng mikrotik-monitor với PM2"
    
    # Lưu cấu hình PM2
    pm2 save
    log "✓ Đã lưu cấu hình PM2"
    
    # Thiết lập khởi động cùng hệ thống nếu chưa có
    if ! pm2 startup | grep -q "already enabled"; then
      local STARTUP_CMD=$(pm2 startup | grep "sudo" | tail -n1)
      if [ -n "$STARTUP_CMD" ]; then
        eval "$STARTUP_CMD"
        log "✓ Đã thiết lập PM2 khởi động cùng hệ thống"
      fi
    else
      log "✓ PM2 đã được thiết lập khởi động cùng hệ thống"
    fi
  else
    error "Không tìm thấy thư mục ứng dụng $APP_DIR"
  fi
}

# Kiểm tra truy cập
check_access() {
  log "Kiểm tra truy cập..."
  
  # Đợi ứng dụng khởi động
  log "Chờ ứng dụng khởi động (5 giây)..."
  sleep 5
  
  IP_ADDRESS=$(hostname -I | awk '{print $1}')
  PORT=5000
  
  echo -e "\n${BLUE}=== KIỂM TRA TRUY CẬP CỔNG 5000 ===${NC}"
  
  # Kiểm tra kết nối local
  nc -z -v localhost $PORT 2>&1 || log "⚠️ Không thể kết nối đến localhost:$PORT"
  
  # Kiểm tra kết nối bằng IP
  nc -z -v $IP_ADDRESS $PORT 2>&1 || log "⚠️ Không thể kết nối đến $IP_ADDRESS:$PORT"
  
  # Kiểm tra bằng curl
  curl -s -o /dev/null -w "Kết nối http://$IP_ADDRESS:$PORT: %{http_code}\n" http://$IP_ADDRESS:$PORT || log "⚠️ Không thể curl đến $IP_ADDRESS:$PORT"
  
  log "Kiểm tra truy cập hoàn tất."
}

# Hiển thị thông tin
show_info() {
  IP_ADDRESS=$(hostname -I | awk '{print $1}')
  
  echo -e "\n${GREEN}=== THÔNG TIN TRUY CẬP ===${NC}"
  echo -e "URL truy cập ứng dụng: ${YELLOW}http://$IP_ADDRESS:5000${NC}"
  echo -e "Địa chỉ IP Server: ${YELLOW}$IP_ADDRESS${NC}"
  echo -e "Cổng: ${YELLOW}5000${NC}"
  
  echo -e "\n${BLUE}=== QUẢN LÝ ỨNG DỤNG ===${NC}"
  echo -e "Xem logs: ${YELLOW}pm2 logs mikrotik-monitor${NC}"
  echo -e "Khởi động lại: ${YELLOW}pm2 restart mikrotik-monitor${NC}"
  echo -e "Dừng: ${YELLOW}pm2 stop mikrotik-monitor${NC}"
  echo -e "Xem trạng thái: ${YELLOW}pm2 status${NC}"
  
  echo -e "\n${BLUE}=== KIỂM TRA CỔNG TỪ MÁY KHÁC ===${NC}"
  echo -e "Từ máy khác trong mạng LAN, bạn có thể kiểm tra kết nối bằng lệnh:"
  echo -e "   ${YELLOW}ping $IP_ADDRESS${NC}"
  echo -e "   ${YELLOW}nc -z -v $IP_ADDRESS 5000${NC}"
  echo -e "   ${YELLOW}curl http://$IP_ADDRESS:5000${NC}"
  echo -e "   ${YELLOW}curl http://$IP_ADDRESS:5000/api/devices${NC}"
}

# Hàm chính
main() {
  # Kiểm tra quyền root
  if [[ $EUID -ne 0 ]]; then
    error "Script này phải được chạy với quyền sudo hoặc root"
  fi
  
  show_banner
  
  # Trước tiên kiểm tra logs và cổng 5000
  check_pm2_logs
  check_port_5000
  
  # Xác nhận trước khi tiếp tục
  echo -e "\n${YELLOW}Script này sẽ dừng và cấu hình lại ứng dụng Mikrotik Monitoring."
  echo -e "Tiếp tục? (y/n)${NC}"
  read confirmation
  
  if [[ "$confirmation" != "y" && "$confirmation" != "Y" ]]; then
    echo -e "${RED}Đã hủy bỏ.${NC}"
    exit 0
  fi
  
  # Dừng tất cả các tiến trình Node.js đang chạy
  stop_node_processes
  
  # Kiểm tra lại cổng 5000
  check_port_5000
  
  # Tạo file khởi động mới
  create_new_start_file
  
  # Cấu hình PM2 khởi động lại
  reconfigure_pm2
  
  # Kiểm tra truy cập
  check_access
  
  # Hiển thị thông tin
  show_info
  
  log "Quá trình sửa lỗi đã hoàn tất. Vui lòng kiểm tra trạng thái ứng dụng."
}

# Thực thi hàm chính
main