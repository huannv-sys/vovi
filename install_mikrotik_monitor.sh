#!/bin/bash

# Script cài đặt tự động Mikrotik Monitoring trên Ubuntu
# Tác giả: Expert Developer
# Phiên bản: 1.0
# -----------------------------------------------------------------------------

# Thiết lập môi trường
set -e
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color
APP_DIR="/opt/mikrotik-monitoring"
LOG_FILE="/var/log/mikrotik-monitor-install.log"

# Khởi tạo file log
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

# Hàm kiểm tra và cài đặt các gói cần thiết
install_dependencies() {
  log "Cài đặt các gói phụ thuộc..."
  
  sudo apt-get update -qq || error "Không thể cập nhật danh sách gói"
  
  # Kiểm tra và cài đặt các gói cần thiết
  DEPS="curl wget unzip git build-essential"
  for pkg in $DEPS; do
    if ! dpkg -l | grep -q $pkg; then
      log "Cài đặt $pkg..."
      sudo apt-get install -qq -y $pkg >> $LOG_FILE 2>&1 || error "Không thể cài đặt $pkg"
    else
      log "$pkg đã được cài đặt."
    fi
  done
  
  # Kiểm tra và cài đặt Node.js
  if ! command -v node &> /dev/null; then
    log "Cài đặt Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - >> $LOG_FILE 2>&1
    sudo apt-get install -qq -y nodejs >> $LOG_FILE 2>&1 || error "Không thể cài đặt Node.js"
  else
    NODE_VERSION=$(node -v)
    log "Node.js $NODE_VERSION đã được cài đặt"
  fi
  
  # Kiểm tra và cài đặt PM2 (quản lý process)
  if ! command -v pm2 &> /dev/null; then
    log "Cài đặt PM2 process manager..."
    sudo npm install -g pm2 >> $LOG_FILE 2>&1 || error "Không thể cài đặt PM2"
  else
    log "PM2 đã được cài đặt"
  fi
  
  log "Tất cả các phụ thuộc đã được cài đặt thành công."
}

# Hàm cài đặt ứng dụng Mikrotik Monitoring
setup_application() {
  log "Cài đặt Mikrotik Monitoring..."
  
  # Tạo thư mục ứng dụng
  sudo mkdir -p $APP_DIR || error "Không thể tạo thư mục ứng dụng $APP_DIR"
  
  # Sử dụng thư mục hiện tại
  CURRENT_DIR=$(pwd)
  
  log "Sao chép dữ liệu từ thư mục hiện tại vào $APP_DIR..."
  
  # Sao chép tất cả các file và thư mục trừ script cài đặt
  sudo cp -r ./client $APP_DIR/ || error "Không thể sao chép thư mục client"
  sudo cp -r ./server $APP_DIR/ || error "Không thể sao chép thư mục server"
  sudo cp -r ./shared $APP_DIR/ || error "Không thể sao chép thư mục shared"
  
  # Sao chép các file cấu hình
  sudo cp ./package.json $APP_DIR/ || error "Không thể sao chép package.json"
  sudo cp ./package-lock.json $APP_DIR/ || log "Không tìm thấy package-lock.json, bỏ qua"
  sudo cp ./drizzle.config.ts $APP_DIR/ || log "Không tìm thấy drizzle.config.ts, bỏ qua"
  sudo cp ./postcss.config.js $APP_DIR/ || log "Không tìm thấy postcss.config.js, bỏ qua"
  sudo cp ./tailwind.config.ts $APP_DIR/ || log "Không tìm thấy tailwind.config.ts, bỏ qua"
  sudo cp ./theme.json $APP_DIR/ || log "Không tìm thấy theme.json, bỏ qua"
  sudo cp ./tsconfig.json $APP_DIR/ || log "Không tìm thấy tsconfig.json, bỏ qua"
  sudo cp ./vite.config.ts $APP_DIR/ || log "Không tìm thấy vite.config.ts, bỏ qua"
  
  # Di chuyển vào thư mục ứng dụng
  cd $APP_DIR || error "Không thể truy cập thư mục ứng dụng"
  
  # Cài đặt các gói phụ thuộc của ứng dụng
  log "Cài đặt các gói phụ thuộc npm..."
  sudo npm install >> $LOG_FILE 2>&1 || error "Không thể cài đặt các gói npm"
  
  # Phân quyền
  sudo chown -R $(whoami):$(whoami) $APP_DIR || error "Không thể thiết lập quyền cho thư mục ứng dụng"
  
  log "Ứng dụng đã được cài đặt thành công."
}

# Hàm cấu hình cơ sở dữ liệu
setup_database() {
  log "Thiết lập cơ sở dữ liệu..."
  
  # Kiểm tra và cài đặt PostgreSQL nếu cần
  if ! command -v psql &> /dev/null; then
    log "Cài đặt PostgreSQL..."
    sudo apt-get install -qq -y postgresql postgresql-contrib >> $LOG_FILE 2>&1 || error "Không thể cài đặt PostgreSQL"
  else
    log "PostgreSQL đã được cài đặt"
  fi
  
  # Tạo cơ sở dữ liệu và người dùng
  DB_NAME="mikrotik_monitor"
  DB_USER="mikrotik_user"
  DB_PASS=$(openssl rand -base64 12) # Tạo mật khẩu ngẫu nhiên
  
  log "Tạo cơ sở dữ liệu PostgreSQL..."
  
  # Tạo người dùng và cơ sở dữ liệu
  sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';" >> $LOG_FILE 2>&1 || log "Người dùng đã tồn tại, bỏ qua"
  sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;" >> $LOG_FILE 2>&1 || log "Cơ sở dữ liệu đã tồn tại, bỏ qua"
  sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;" >> $LOG_FILE 2>&1
  
  # Tạo file cấu hình .env trong thư mục ứng dụng
  cat > $APP_DIR/.env << EOF
DATABASE_URL=postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME
EOF
  
  log "Cơ sở dữ liệu đã được cấu hình thành công."
  log "Thông tin kết nối đã được lưu vào $APP_DIR/.env"
}

# Hàm thiết lập PM2 để quản lý ứng dụng
setup_pm2() {
  log "Cấu hình PM2 để quản lý ứng dụng..."
  
  # Di chuyển vào thư mục ứng dụng
  cd $APP_DIR || error "Không thể truy cập thư mục ứng dụng"
  
  # Tạo file cấu hình PM2
  cat > ecosystem.config.cjs << EOF
module.exports = {
  apps : [{
    name: 'mikrotik-monitor',
    script: 'npm',
    args: 'run dev',
    env: {
      NODE_ENV: 'production',
    },
    watch: false,
    max_memory_restart: '500M'
  }]
};
EOF
  
  # Tạo file npm start
  cat > start.js << EOF
const { exec } = require('child_process');
exec('npm run dev', { stdio: 'inherit' });
EOF

  # Khởi động ứng dụng với PM2
  pm2 start start.js --name mikrotik-monitor || error "Không thể khởi động ứng dụng với PM2"
  
  # Cấu hình PM2 khởi động cùng hệ thống
  pm2 save
  pm2 startup
  sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u $(whoami) --hp $(echo $HOME)
  
  log "PM2 đã được cấu hình thành công."
}

# Hàm cấu hình firewall
setup_firewall() {
  log "Cấu hình firewall..."
  
  # Kiểm tra và cài đặt ufw nếu cần
  if ! command -v ufw &> /dev/null; then
    log "Cài đặt UFW firewall..."
    sudo apt-get install -qq -y ufw >> $LOG_FILE 2>&1 || error "Không thể cài đặt UFW"
  fi
  
  # Mở cổng 5000 cho ứng dụng web
  sudo ufw allow 5000/tcp >> $LOG_FILE 2>&1
  
  # Đảm bảo SSH luôn được cho phép để tránh mất kết nối
  sudo ufw allow ssh >> $LOG_FILE 2>&1
  
  # Kích hoạt firewall nếu chưa được kích hoạt
  if ! sudo ufw status | grep -q "Status: active"; then
    log "Kích hoạt UFW firewall..."
    echo "y" | sudo ufw enable >> $LOG_FILE 2>&1
  fi
  
  log "Firewall đã được cấu hình thành công."
}

# Hiển thị thông tin khi hoàn tất
show_completion_info() {
  IP_ADDRESS=$(hostname -I | awk '{print $1}')
  
  echo -e "\n${GREEN}=== CÀI ĐẶT HOÀN TẤT ===${NC}"
  echo -e "Mikrotik Monitoring đã được cài đặt thành công!\n"
  echo -e "Thông tin truy cập:"
  echo -e "  URL:      ${YELLOW}http://$IP_ADDRESS:5000${NC}"
  echo -e "  Thư mục:  ${YELLOW}$APP_DIR${NC}"
  echo -e "  Logs:     ${YELLOW}pm2 logs mikrotik-monitor${NC}"
  echo -e "\nĐể quản lý ứng dụng, sử dụng các lệnh sau:"
  echo -e "  Khởi động: ${YELLOW}pm2 start mikrotik-monitor${NC}"
  echo -e "  Dừng:      ${YELLOW}pm2 stop mikrotik-monitor${NC}"
  echo -e "  Khởi động lại: ${YELLOW}pm2 restart mikrotik-monitor${NC}"
  echo -e "  Xem logs:  ${YELLOW}pm2 logs mikrotik-monitor${NC}"
  echo -e "\nThông tin cài đặt đã được ghi vào: ${YELLOW}$LOG_FILE${NC}\n"
}

# Hàm chính thực thi tất cả các bước
main() {
  echo -e "${GREEN}=== BẮT ĐẦU CÀI ĐẶT MIKROTIK MONITORING ===${NC}"
  
  install_dependencies
  setup_application
  setup_database
  setup_pm2
  setup_firewall
  
  show_completion_info
}

# Thực thi hàm chính
main