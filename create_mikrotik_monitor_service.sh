#!/bin/bash

# Script tạo systemd service cho Mikrotik Monitoring
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
SERVICE_NAME="mikrotik-monitor"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
ENV_FILE="$APP_DIR/.env"
LOG_FILE="/var/log/mikrotik-monitor-service.log"

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
  echo "║           MIKROTIK MONITORING SYSTEMD SERVICE              ║"
  echo "║         Tạo service quản lý của hệ thống cho ứng dụng      ║"
  echo "╚════════════════════════════════════════════════════════════╝"
  echo -e "${NC}"
}

# Kiểm tra quyền root
check_root() {
  if [[ $EUID -ne 0 ]]; then
    error "Script này phải được chạy với quyền sudo hoặc root"
  fi
}

# Kiểm tra và dừng PM2 nếu đang chạy
check_pm2() {
  log "Kiểm tra và tắt PM2 nếu đang chạy..."
  
  if command -v pm2 &> /dev/null; then
    if pm2 list | grep -q "$SERVICE_NAME"; then
      pm2 stop "$SERVICE_NAME" || log "⚠️ Không thể dừng $SERVICE_NAME trong PM2"
      pm2 delete "$SERVICE_NAME" || log "⚠️ Không thể xóa $SERVICE_NAME khỏi PM2"
      
      # Disable PM2 startup
      pm2 unstartup systemd
      pm2 save
      
      log "✓ Đã dừng và xóa ứng dụng khỏi PM2"
    else
      log "✓ Không tìm thấy ứng dụng trong PM2"
    fi
  else
    log "✓ PM2 không được cài đặt, bỏ qua bước kiểm tra PM2"
  fi
}

# Tạo file khởi động trực tiếp
create_start_file() {
  log "Tạo file khởi động trực tiếp..."
  
  # Tạo file khởi động riêng
  cat > "$APP_DIR/start-systemd.js" << 'EOF'
#!/usr/bin/env node

/**
 * Script khởi động Mikrotik Monitoring cho systemd
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Set NODE_ENV
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

// Set các biến môi trường từ .env file nếu có
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  console.log(`[Startup] Loading environment from ${envPath}`);
  
  const envContent = fs.readFileSync(envPath, 'utf8');
  const envVars = envContent.split('\n');
  
  for (const line of envVars) {
    if (line.trim() && !line.startsWith('#')) {
      const parts = line.split('=');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        // Nối lại phần còn lại để phòng trường hợp giá trị chứa dấu =
        const value = parts.slice(1).join('=').trim();
        if (!process.env[key]) {
          process.env[key] = value;
          console.log(`[Startup] Set environment variable: ${key}`);
        }
      }
    }
  }
}

// Đảm bảo cổng và host được đặt
process.env.PORT = process.env.PORT || 5000;
process.env.HOST = process.env.HOST || '0.0.0.0';

console.log(`[Startup] Starting server on ${process.env.HOST}:${process.env.PORT}`);
console.log(`[Startup] Working directory: ${__dirname}`);
console.log(`[Startup] NODE_ENV: ${process.env.NODE_ENV}`);

// Khởi động ứng dụng
const command = process.env.NODE_ENV === 'production' ? 'start' : 'dev';
console.log(`[Startup] Running: npm run ${command}`);

const child = spawn('npm', ['run', command], {
  cwd: __dirname,
  stdio: 'inherit',
  env: process.env
});

child.on('error', (error) => {
  console.error(`[Startup Error] ${error.message}`);
  process.exit(1);
});

child.on('close', (code) => {
  console.log(`[Startup] Process exited with code ${code}`);
  process.exit(code);
});

// Xử lý tín hiệu chấm dứt
process.on('SIGINT', () => {
  console.log('[Startup] Received SIGINT, shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[Startup] Received SIGTERM, shutting down...');
  process.exit(0);
});
EOF
  
  # Cấp quyền thực thi
  chmod +x "$APP_DIR/start-systemd.js"
  
  log "✓ Đã tạo file start-systemd.js"
}

# Tạo file service
create_service_file() {
  log "Tạo file service systemd..."
  
  # Xác định user để chạy service
  CURRENT_USER=$(logname 2>/dev/null || echo "${SUDO_USER:-root}")
  log "Service sẽ chạy với user $CURRENT_USER"
  
  cat > "$SERVICE_FILE" << EOF
[Unit]
Description=Mikrotik Monitoring Service
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=$CURRENT_USER
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/node $APP_DIR/start-systemd.js
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=mikrotik-monitor
Environment=NODE_ENV=production
EnvironmentFile=-$ENV_FILE

[Install]
WantedBy=multi-user.target
EOF
  
  log "✓ Đã tạo file service tại $SERVICE_FILE"
}

# Cập nhật biến môi trường
update_env_vars() {
  log "Kiểm tra và cập nhật biến môi trường..."
  
  if [ ! -f "$ENV_FILE" ]; then
    log "Tạo mới file .env..."
    cat > "$ENV_FILE" << EOF
HOST=0.0.0.0
PORT=5000
NODE_ENV=production
EOF
    log "✓ Đã tạo file .env với các thiết lập cơ bản"
  else
    # Kiểm tra và đảm bảo các biến cần thiết
    if ! grep -q "^HOST=" "$ENV_FILE"; then
      echo "HOST=0.0.0.0" >> "$ENV_FILE"
      log "✓ Đã thêm HOST=0.0.0.0 vào file .env"
    fi
    
    if ! grep -q "^PORT=" "$ENV_FILE"; then
      echo "PORT=5000" >> "$ENV_FILE"
      log "✓ Đã thêm PORT=5000 vào file .env"
    fi
    
    if ! grep -q "^NODE_ENV=" "$ENV_FILE"; then
      echo "NODE_ENV=production" >> "$ENV_FILE"
      log "✓ Đã thêm NODE_ENV=production vào file .env"
    fi
  fi
  
  log "✓ Đã đảm bảo các biến môi trường cần thiết"
}

# Kích hoạt và khởi động service
enable_service() {
  log "Kích hoạt và khởi động service..."
  
  systemctl daemon-reload
  systemctl enable "$SERVICE_NAME"
  systemctl restart "$SERVICE_NAME"
  
  log "✓ Đã kích hoạt và khởi động service $SERVICE_NAME"
}

# Kiểm tra trạng thái service
check_service_status() {
  log "Kiểm tra trạng thái service..."
  
  echo -e "\n${BLUE}=== THÔNG TIN TRẠNG THÁI SERVICE ===${NC}"
  systemctl status "$SERVICE_NAME" --no-pager
  
  # Kiểm tra cổng đang lắng nghe
  echo -e "\n${BLUE}=== THÔNG TIN CỔNG ĐANG LẮNG NGHE ===${NC}"
  netstat -tulpn | grep -E "5000|node" || echo "Không tìm thấy cổng 5000 đang lắng nghe"
  
  # Kiểm tra logs
  echo -e "\n${BLUE}=== THÔNG TIN LOGS GẦN NHẤT ===${NC}"
  journalctl -u "$SERVICE_NAME" -n 20 --no-pager
}

# Hiển thị thông tin và hướng dẫn
show_info() {
  IP_ADDRESS=$(hostname -I | awk '{print $1}')
  
  echo -e "\n${GREEN}=== THÔNG TIN TRUY CẬP ===${NC}"
  echo -e "URL truy cập ứng dụng: ${YELLOW}http://$IP_ADDRESS:5000${NC}"
  echo -e "Địa chỉ IP Server: ${YELLOW}$IP_ADDRESS${NC}"
  echo -e "Cổng: ${YELLOW}5000${NC}"
  
  echo -e "\n${BLUE}=== QUẢN LÝ SERVICE ===${NC}"
  echo -e "Xem trạng thái: ${YELLOW}sudo systemctl status $SERVICE_NAME${NC}"
  echo -e "Khởi động: ${YELLOW}sudo systemctl start $SERVICE_NAME${NC}"
  echo -e "Dừng: ${YELLOW}sudo systemctl stop $SERVICE_NAME${NC}"
  echo -e "Khởi động lại: ${YELLOW}sudo systemctl restart $SERVICE_NAME${NC}"
  echo -e "Xem logs: ${YELLOW}sudo journalctl -u $SERVICE_NAME -f${NC}"
  
  echo -e "\n${BLUE}=== LƯU Ý QUAN TRỌNG ===${NC}"
  echo -e "1. Service đã được thiết lập để tự động khởi động cùng hệ thống"
  echo -e "2. Khi cập nhật ứng dụng, hãy khởi động lại service: ${YELLOW}sudo systemctl restart $SERVICE_NAME${NC}"
  echo -e "3. Để thay đổi cấu hình, chỉnh sửa file .env và khởi động lại service"
}

# Hàm chính
main() {
  check_root
  show_banner
  
  echo -e "${YELLOW}Script này sẽ cài đặt Mikrotik Monitoring như một systemd service."
  echo -e "Điều này sẽ dừng và vô hiệu hóa phiên bản PM2 hiện tại (nếu có)."
  echo -e "Tiếp tục? (y/n)${NC}"
  read confirmation
  
  if [[ "$confirmation" != "y" && "$confirmation" != "Y" ]]; then
    echo -e "${RED}Đã hủy bỏ.${NC}"
    exit 0
  fi
  
  # Kiểm tra và tắt PM2
  check_pm2
  
  # Tạo file khởi động
  create_start_file
  
  # Cập nhật biến môi trường
  update_env_vars
  
  # Tạo file service
  create_service_file
  
  # Kích hoạt service
  enable_service
  
  # Chờ service khởi động
  log "Chờ service khởi động (5 giây)..."
  sleep 5
  
  # Kiểm tra trạng thái
  check_service_status
  
  # Hiển thị thông tin
  show_info
  
  log "Quá trình cài đặt service đã hoàn tất."
}

# Thực thi hàm chính
main