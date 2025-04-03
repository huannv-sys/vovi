#!/bin/bash

# Script khắc phục sự cố ESM/CommonJS với PM2
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
LOG_FILE="/var/log/mikrotik-monitor-esm-fix.log"

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
  echo "║            MIKROTIK MONITORING ESM/COMMONJS FIX            ║"
  echo "║       Sửa lỗi tương thích ESM/CommonJS cho Node.js         ║"
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
  else
    error "PM2 không được cài đặt trên hệ thống"
  fi
}

# Kiểm tra cấu hình package.json
check_package_json() {
  log "Kiểm tra cấu hình package.json..."
  
  if [ -f "$APP_DIR/package.json" ]; then
    echo -e "\n${BLUE}=== THÔNG TIN PACKAGE.JSON ===${NC}"
    grep -n "type" "$APP_DIR/package.json" || echo "Không tìm thấy trường 'type' trong package.json"
    
    # Kiểm tra xem có cấu hình "type": "module" không
    if grep -q '"type":\s*"module"' "$APP_DIR/package.json"; then
      log "⚠️ Package.json được cấu hình là ESM với \"type\": \"module\""
      PACKAGE_TYPE="module"
    else
      log "✓ Package.json không có cấu hình \"type\": \"module\", mặc định là CommonJS"
      PACKAGE_TYPE="commonjs"
    fi
  else
    log "⚠️ Không tìm thấy file package.json"
  fi
}

# Sửa file start.js cho ESM
fix_start_js_esm() {
  log "Tạo file start.js với cú pháp ESM..."
  
  # Tạo file start.mjs (ESM version)
  cat > "$APP_DIR/start.mjs" << 'EOF'
import { exec } from 'child_process';
exec('npm run dev', { stdio: 'inherit' });
EOF
  
  log "✓ Đã tạo file start.mjs với cú pháp ESM"
  
  # Cập nhật cấu hình PM2
  if pm2 list | grep -q "mikrotik-monitor"; then
    pm2 delete mikrotik-monitor
    log "✓ Đã xóa ứng dụng mikrotik-monitor cũ từ PM2"
  fi
  
  # Khởi động với file mới
  cd "$APP_DIR" || error "Không thể truy cập thư mục ứng dụng"
  pm2 start start.mjs --name mikrotik-monitor
  log "✓ Đã khởi động lại ứng dụng với file start.mjs"
  
  # Lưu cấu hình
  pm2 save
  log "✓ Đã lưu cấu hình PM2"
}

# Sửa file start.js cho CommonJS
fix_start_js_commonjs() {
  log "Tạo file start.cjs với cú pháp CommonJS..."
  
  # Tạo file start.cjs (CommonJS version)
  cat > "$APP_DIR/start.cjs" << 'EOF'
const { exec } = require('child_process');
exec('npm run dev', { stdio: 'inherit' });
EOF
  
  log "✓ Đã tạo file start.cjs với cú pháp CommonJS"
  
  # Cập nhật cấu hình PM2
  if pm2 list | grep -q "mikrotik-monitor"; then
    pm2 delete mikrotik-monitor
    log "✓ Đã xóa ứng dụng mikrotik-monitor cũ từ PM2"
  fi
  
  # Khởi động với file mới
  cd "$APP_DIR" || error "Không thể truy cập thư mục ứng dụng"
  pm2 start start.cjs --name mikrotik-monitor
  log "✓ Đã khởi động lại ứng dụng với file start.cjs"
  
  # Lưu cấu hình
  pm2 save
  log "✓ Đã lưu cấu hình PM2"
}

# Sửa lỗi với package.json
fix_package_json() {
  log "Sửa lỗi cấu hình package.json..."
  
  if [ -f "$APP_DIR/package.json" ]; then
    # Tạo bản sao lưu
    cp "$APP_DIR/package.json" "$APP_DIR/package.json.bak"
    log "✓ Đã tạo bản sao lưu package.json.bak"
    
    echo -e "\n${YELLOW}Bạn muốn thay đổi cấu hình package.json không? (y/n)${NC}"
    read confirmation
    
    if [[ "$confirmation" == "y" || "$confirmation" == "Y" ]]; then
      # Loại bỏ cấu hình "type": "module"
      sed -i 's/"type":\s*"module",\?//' "$APP_DIR/package.json"
      sed -i 's/,\s*}/}/' "$APP_DIR/package.json" # Dọn dẹp dấu phẩy thừa
      log "✓ Đã loại bỏ cấu hình \"type\": \"module\" từ package.json"
      
      # Cập nhật PACKAGE_TYPE
      PACKAGE_TYPE="commonjs"
    else
      log "Giữ nguyên cấu hình package.json"
    fi
  else
    log "⚠️ Không tìm thấy file package.json"
  fi
}

# Tạo server wrapper
create_server_wrapper() {
  log "Tạo server wrapper..."
  
  if [ "$PACKAGE_TYPE" == "module" ]; then
    # Tạo wrapper cho ESM
    cat > "$APP_DIR/server-wrapper.mjs" << 'EOF'
import { createServer } from 'http';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Port và host cho server
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

// Khởi động server trực tiếp
console.log(`[Wrapper] Starting server on ${HOST}:${PORT}`);

// Tạo một HTTP server đơn giản
const server = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Mikrotik Monitoring API Server\n');
});

// Lắng nghe kết nối
server.listen(PORT, HOST, () => {
  console.log(`[Wrapper] Server is running at http://${HOST}:${PORT}`);
  
  // Khởi động ứng dụng chính trong tiến trình con
  const child = spawn('npm', ['run', 'dev'], {
    cwd: __dirname,
    stdio: 'inherit',
    env: {
      ...process.env,
      PORT: '3000', // Sử dụng cổng khác cho ứng dụng chính
    }
  });
  
  child.on('error', (error) => {
    console.error(`[Wrapper] Error starting application: ${error.message}`);
  });
  
  child.on('close', (code) => {
    console.log(`[Wrapper] Application exited with code ${code}`);
  });
});

// Xử lý tín hiệu kết thúc
process.on('SIGINT', () => {
  console.log('[Wrapper] Received SIGINT signal, shutting down...');
  server.close(() => {
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('[Wrapper] Received SIGTERM signal, shutting down...');
  server.close(() => {
    process.exit(0);
  });
});
EOF
    
    log "✓ Đã tạo file server-wrapper.mjs với cú pháp ESM"
    
  else
    # Tạo wrapper cho CommonJS
    cat > "$APP_DIR/server-wrapper.js" << 'EOF'
const { createServer } = require('http');
const { spawn } = require('child_process');
const path = require('path');

// Port và host cho server
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

// Khởi động server trực tiếp
console.log(`[Wrapper] Starting server on ${HOST}:${PORT}`);

// Tạo một HTTP server đơn giản
const server = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Mikrotik Monitoring API Server\n');
});

// Lắng nghe kết nối
server.listen(PORT, HOST, () => {
  console.log(`[Wrapper] Server is running at http://${HOST}:${PORT}`);
  
  // Khởi động ứng dụng chính trong tiến trình con
  const child = spawn('npm', ['run', 'dev'], {
    cwd: __dirname,
    stdio: 'inherit',
    env: {
      ...process.env,
      PORT: '3000', // Sử dụng cổng khác cho ứng dụng chính
    }
  });
  
  child.on('error', (error) => {
    console.error(`[Wrapper] Error starting application: ${error.message}`);
  });
  
  child.on('close', (code) => {
    console.log(`[Wrapper] Application exited with code ${code}`);
  });
});

// Xử lý tín hiệu kết thúc
process.on('SIGINT', () => {
  console.log('[Wrapper] Received SIGINT signal, shutting down...');
  server.close(() => {
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('[Wrapper] Received SIGTERM signal, shutting down...');
  server.close(() => {
    process.exit(0);
  });
});
EOF
    
    log "✓ Đã tạo file server-wrapper.js với cú pháp CommonJS"
  fi
}

# Cấu hình PM2 với wrapper
configure_pm2_wrapper() {
  log "Cấu hình PM2 với wrapper..."
  
  # Dừng và xóa ứng dụng hiện tại nếu có
  if pm2 list | grep -q "mikrotik-monitor"; then
    pm2 delete mikrotik-monitor
    log "✓ Đã xóa ứng dụng mikrotik-monitor hiện tại từ PM2"
  fi
  
  # Khởi động với wrapper
  cd "$APP_DIR" || error "Không thể truy cập thư mục ứng dụng"
  
  if [ "$PACKAGE_TYPE" == "module" ]; then
    pm2 start server-wrapper.mjs --name mikrotik-monitor
    log "✓ Đã khởi động wrapper ESM với PM2"
  else
    pm2 start server-wrapper.js --name mikrotik-monitor
    log "✓ Đã khởi động wrapper CommonJS với PM2"
  fi
  
  # Lưu cấu hình
  pm2 save
  log "✓ Đã lưu cấu hình PM2"
}

# Kiểm tra truy cập
check_access() {
  log "Kiểm tra truy cập..."
  
  # Đợi ứng dụng khởi động
  log "Chờ ứng dụng khởi động (10 giây)..."
  sleep 10
  
  IP_ADDRESS=$(hostname -I | awk '{print $1}')
  PORT=5000
  
  echo -e "\n${BLUE}=== KIỂM TRA TRUY CẬP CỔNG 5000 ===${NC}"
  
  # Kiểm tra kết nối local
  nc -z -v localhost $PORT 2>&1 || log "⚠️ Không thể kết nối đến localhost:$PORT"
  
  # Kiểm tra kết nối bằng IP
  nc -z -v $IP_ADDRESS $PORT 2>&1 || log "⚠️ Không thể kết nối đến $IP_ADDRESS:$PORT"
  
  # Kiểm tra bằng curl
  curl -I -s http://localhost:$PORT | head -n 1 || log "⚠️ Không thể curl đến localhost:$PORT"
  curl -I -s http://$IP_ADDRESS:$PORT | head -n 1 || log "⚠️ Không thể curl đến $IP_ADDRESS:$PORT"
  
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
  
  echo -e "\n${BLUE}=== CÁCH KHẮC PHỤC NẾU VẪN GẶP LỖI ===${NC}"
  echo -e "1. Kiểm tra logs PM2: ${YELLOW}pm2 logs mikrotik-monitor${NC}"
  echo -e "2. Sử dụng Node.js phiên bản 16: ${YELLOW}nvm use 16${NC} (nếu đã cài NVM)"
  echo -e "3. Khởi động lại server: ${YELLOW}sudo reboot${NC}"
  echo -e "4. Liên hệ hỗ trợ nếu vấn đề vẫn tiếp diễn"
}

# Hàm chính
main() {
  # Kiểm tra quyền root
  if [[ $EUID -ne 0 ]]; then
    error "Script này phải được chạy với quyền sudo hoặc root"
  fi
  
  show_banner
  
  # Kiểm tra logs và cấu hình
  check_pm2_logs
  check_package_json
  
  # Xác nhận trước khi tiếp tục
  echo -e "\n${YELLOW}Script này sẽ sửa lỗi ESM/CommonJS cho ứng dụng Mikrotik Monitoring."
  echo -e "Tiếp tục? (y/n)${NC}"
  read confirmation
  
  if [[ "$confirmation" != "y" && "$confirmation" != "Y" ]]; then
    echo -e "${RED}Đã hủy bỏ.${NC}"
    exit 0
  fi
  
  # Sửa lỗi tùy thuộc vào tình huống
  if [ "$PACKAGE_TYPE" == "module" ]; then
    echo -e "\n${YELLOW}Phát hiện cấu hình ESM (\"type\": \"module\") trong package.json."
    echo -e "Bạn muốn:"
    echo -e "1. Sửa file khởi động để tương thích với ESM"
    echo -e "2. Loại bỏ cấu hình \"type\": \"module\" (chuyển sang CommonJS)"
    echo -e "3. Tạo wrapper server để giải quyết vấn đề"
    echo -e "Lựa chọn của bạn (1-3):${NC}"
    read choice
    
    case $choice in
      1)
        fix_start_js_esm
        ;;
      2)
        fix_package_json
        fix_start_js_commonjs
        ;;
      3)
        create_server_wrapper
        configure_pm2_wrapper
        ;;
      *)
        log "Lựa chọn không hợp lệ. Đang sử dụng phương pháp 3 (tạo wrapper)..."
        create_server_wrapper
        configure_pm2_wrapper
        ;;
    esac
  else
    # CommonJS - chỉ cần sửa file start.js
    echo -e "\n${YELLOW}Phát hiện cấu hình CommonJS hoặc không có cấu hình \"type\" trong package.json."
    echo -e "Bạn muốn:"
    echo -e "1. Sửa file khởi động để tương thích với CommonJS"
    echo -e "2. Tạo wrapper server để giải quyết vấn đề"
    echo -e "Lựa chọn của bạn (1-2):${NC}"
    read choice
    
    case $choice in
      1)
        fix_start_js_commonjs
        ;;
      2)
        create_server_wrapper
        configure_pm2_wrapper
        ;;
      *)
        log "Lựa chọn không hợp lệ. Đang sử dụng phương pháp 1 (sửa file khởi động)..."
        fix_start_js_commonjs
        ;;
    esac
  fi
  
  # Kiểm tra truy cập
  check_access
  
  # Hiển thị thông tin
  show_info
  
  log "Quá trình sửa lỗi đã hoàn tất. Vui lòng kiểm tra trạng thái ứng dụng."
}

# Thực thi hàm chính
main