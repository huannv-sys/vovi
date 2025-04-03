#!/bin/bash

# Script khắc phục vấn đề truy cập mạng LAN cho Mikrotik Monitoring
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
LOG_FILE="/var/log/mikrotik-monitor-network.log"

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
  echo "║           MIKROTIK MONITORING NETWORK ACCESS FIX           ║"
  echo "║            Sửa lỗi truy cập mạng LAN cho server           ║"
  echo "╚════════════════════════════════════════════════════════════╝"
  echo -e "${NC}"
}

# Kiểm tra quyền root
check_root() {
  if [[ $EUID -ne 0 ]]; then
    error "Script này phải được chạy với quyền sudo hoặc root"
  fi
}

# Kiểm tra IP và cổng đang lắng nghe
check_listening_ports() {
  log "Kiểm tra các cổng đang lắng nghe..."
  
  echo -e "\n${BLUE}=== THÔNG TIN CỔNG ĐANG LẮNG NGHE ===${NC}"
  netstat -tulpn | grep LISTEN
  
  # Kiểm tra cổng 5000 đặc biệt
  if netstat -tulpn | grep -q ":5000"; then
    PORT_INFO=$(netstat -tulpn | grep ":5000")
    echo -e "\n${GREEN}Cổng 5000 đang lắng nghe:${NC} $PORT_INFO"
    
    # Kiểm tra xem có lắng nghe trên 0.0.0.0 không
    if echo "$PORT_INFO" | grep -q "0.0.0.0:5000"; then
      log "✓ Cổng 5000 đang lắng nghe trên tất cả các giao diện mạng (0.0.0.0)"
    else
      IP_BINDING=$(echo "$PORT_INFO" | awk '{print $4}' | cut -d: -f1)
      log "⚠️ Cổng 5000 chỉ lắng nghe trên $IP_BINDING, không phải trên tất cả các giao diện"
      FIX_BINDING=true
    fi
  else
    log "⚠️ Không tìm thấy ứng dụng nào lắng nghe trên cổng 5000"
  fi
}

# Kiểm tra cấu hình firewall
check_firewall() {
  log "Kiểm tra cấu hình firewall..."
  
  if command -v ufw &> /dev/null; then
    echo -e "\n${BLUE}=== THÔNG TIN FIREWALL (UFW) ===${NC}"
    sudo ufw status verbose
    
    # Kiểm tra xem cổng 5000 đã được mở chưa
    if sudo ufw status | grep -q "5000"; then
      log "✓ Cổng 5000 đã được mở trong firewall"
    else
      log "⚠️ Cổng 5000 chưa được mở trong firewall"
      FIX_FIREWALL=true
    fi
  else
    log "UFW không được cài đặt"
    
    # Kiểm tra iptables
    if command -v iptables &> /dev/null; then
      echo -e "\n${BLUE}=== THÔNG TIN IPTABLES ===${NC}"
      sudo iptables -L -n
      
      # Kiểm tra xem cổng 5000 đã được mở chưa
      if sudo iptables -L -n | grep -q "dpt:5000"; then
        log "✓ Cổng 5000 đã được mở trong iptables"
      else
        log "⚠️ Cổng 5000 chưa được mở trong iptables"
        FIX_FIREWALL=true
      fi
    fi
  fi
}

# Kiểm tra cấu hình Node.js
check_nodejs_config() {
  log "Kiểm tra cấu hình Node.js..."
  
  if [ -d "$APP_DIR" ]; then
    # Kiểm tra file server/index.ts
    if [ -f "$APP_DIR/server/index.ts" ]; then
      echo -e "\n${BLUE}=== THÔNG TIN CẤU HÌNH NODEJS SERVER ===${NC}"
      grep -n "listen" "$APP_DIR/server/index.ts"
      
      # Kiểm tra xem có lắng nghe trên 0.0.0.0 không
      if grep -q "0.0.0.0" "$APP_DIR/server/index.ts"; then
        log "✓ Cấu hình Node.js đã thiết lập để lắng nghe trên tất cả các giao diện (0.0.0.0)"
      else
        log "⚠️ Cấu hình Node.js không thiết lập để lắng nghe trên tất cả các giao diện"
        FIX_NODEJS=true
      fi
    else
      log "⚠️ Không tìm thấy file server/index.ts"
    fi
    
    # Kiểm tra file .env
    if [ -f "$APP_DIR/.env" ]; then
      echo -e "\n${BLUE}=== THÔNG TIN CẤU HÌNH .ENV ===${NC}"
      grep -E "HOST|PORT" "$APP_DIR/.env" || echo "Không tìm thấy cấu hình HOST hoặc PORT"
      
      # Kiểm tra biến HOST trong .env
      if grep -q "HOST=0.0.0.0" "$APP_DIR/.env"; then
        log "✓ Biến môi trường HOST đã được thiết lập là 0.0.0.0"
      else
        log "⚠️ Biến môi trường HOST chưa được thiết lập đúng trong .env"
        FIX_ENV=true
      fi
    else
      log "⚠️ Không tìm thấy file .env"
      FIX_ENV=true
    fi
  else
    log "⚠️ Không tìm thấy thư mục ứng dụng $APP_DIR"
  fi
}

# Kiểm tra kết nối mạng
check_network() {
  log "Kiểm tra cấu hình mạng..."
  
  echo -e "\n${BLUE}=== THÔNG TIN GIAO DIỆN MẠNG ===${NC}"
  ip -br addr
  
  echo -e "\n${BLUE}=== THÔNG TIN BẢNG ĐỊNH TUYẾN ===${NC}"
  ip route
  
  # Lấy địa chỉ IP chính
  IP_ADDRESS=$(hostname -I | awk '{print $1}')
  log "Địa chỉ IP chính: $IP_ADDRESS"
  
  # Thử ping đến địa chỉ IP chính
  echo -e "\n${BLUE}=== KIỂM TRA KẾT NỐI MẠNG ===${NC}"
  ping -c 3 $IP_ADDRESS || log "⚠️ Không thể ping đến địa chỉ IP chính"
}

# Sửa lỗi cấu hình Node.js
fix_nodejs_config() {
  log "Sửa lỗi cấu hình Node.js..."
  
  if [ -f "$APP_DIR/server/index.ts" ]; then
    # Tạo bản sao lưu
    cp "$APP_DIR/server/index.ts" "$APP_DIR/server/index.ts.bak"
    log "✓ Đã tạo bản sao lưu tại $APP_DIR/server/index.ts.bak"
    
    # Tìm và sửa chữa cấu hình lắng nghe
    # Giả sử có một dòng như server.listen(port) hoặc app.listen(port)
    if grep -q "server.listen" "$APP_DIR/server/index.ts"; then
      sudo sed -i 's/server\.listen([^)]*)/server.listen({ port: 5000, host: "0.0.0.0" })/g' "$APP_DIR/server/index.ts"
      log "✓ Đã sửa cấu hình server.listen để lắng nghe trên 0.0.0.0:5000"
    elif grep -q "app.listen" "$APP_DIR/server/index.ts"; then
      if ! grep -q "0.0.0.0" "$APP_DIR/server/index.ts"; then
        sudo sed -i 's/app\.listen([^)]*)/app.listen(5000, "0.0.0.0", function() { console.log("Server running on 0.0.0.0:5000"); })/g' "$APP_DIR/server/index.ts"
        log "✓ Đã sửa cấu hình app.listen để lắng nghe trên 0.0.0.0:5000"
      fi
    else
      log "⚠️ Không tìm thấy cấu hình lắng nghe trong file server/index.ts"
    fi
  else
    log "⚠️ Không tìm thấy file server/index.ts"
  fi
}

# Sửa lỗi biến môi trường
fix_env_config() {
  log "Sửa lỗi biến môi trường..."
  
  if [ -f "$APP_DIR/.env" ]; then
    # Kiểm tra và thêm HOST nếu chưa có
    if ! grep -q "HOST=" "$APP_DIR/.env"; then
      echo "HOST=0.0.0.0" >> "$APP_DIR/.env"
      log "✓ Đã thêm HOST=0.0.0.0 vào file .env"
    else
      # Cập nhật HOST nếu đã tồn tại
      sudo sed -i 's/HOST=.*/HOST=0.0.0.0/g' "$APP_DIR/.env"
      log "✓ Đã cập nhật HOST=0.0.0.0 trong file .env"
    fi
    
    # Kiểm tra và thêm PORT nếu chưa có
    if ! grep -q "PORT=" "$APP_DIR/.env"; then
      echo "PORT=5000" >> "$APP_DIR/.env"
      log "✓ Đã thêm PORT=5000 vào file .env"
    fi
  else
    # Tạo file .env mới
    cat > "$APP_DIR/.env" << EOF
HOST=0.0.0.0
PORT=5000
NODE_ENV=production
EOF
    log "✓ Đã tạo file .env mới với HOST=0.0.0.0 và PORT=5000"
  fi
}

# Sửa lỗi firewall
fix_firewall() {
  log "Sửa lỗi firewall..."
  
  if command -v ufw &> /dev/null; then
    # Mở cổng 5000 trong UFW
    sudo ufw allow 5000/tcp
    log "✓ Đã mở cổng 5000 trong UFW"
    
    # Đảm bảo firewall được bật
    if ! sudo ufw status | grep -q "Status: active"; then
      sudo ufw --force enable
      log "✓ Đã bật UFW"
    fi
  elif command -v iptables &> /dev/null; then
    # Mở cổng 5000 trong iptables
    sudo iptables -A INPUT -p tcp --dport 5000 -j ACCEPT
    sudo iptables-save > /etc/iptables/rules.v4 || log "⚠️ Không thể lưu quy tắc iptables"
    log "✓ Đã mở cổng 5000 trong iptables"
  else
    log "⚠️ Không tìm thấy công cụ quản lý firewall"
  fi
}

# Khởi động lại ứng dụng
restart_application() {
  log "Khởi động lại ứng dụng..."
  
  if command -v pm2 &> /dev/null; then
    # Khởi động lại ứng dụng với PM2
    cd "$APP_DIR" || error "Không thể truy cập thư mục ứng dụng"
    
    if pm2 list | grep -q "mikrotik-monitor"; then
      pm2 restart mikrotik-monitor
      log "✓ Đã khởi động lại ứng dụng với PM2"
    else
      # Tạo file start.js mới
      cat > "$APP_DIR/start.js" << EOF
const { exec } = require('child_process');
exec('npm run dev', { stdio: 'inherit' });
EOF
      
      pm2 start start.js --name mikrotik-monitor
      log "✓ Đã khởi động ứng dụng mới với PM2"
    fi
    
    # Lưu cấu hình PM2
    pm2 save
  else
    log "⚠️ PM2 không được cài đặt, không thể khởi động lại ứng dụng"
  fi
}

# Kiểm tra truy cập
check_access() {
  log "Kiểm tra truy cập..."
  
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
  
  echo -e "\n${BLUE}=== KIỂM TRA CỔNG TỪ MÁY KHÁC ===${NC}"
  echo -e "Từ máy khác trong mạng LAN, bạn có thể kiểm tra kết nối bằng lệnh:"
  echo -e "   ${YELLOW}ping $IP_ADDRESS${NC}"
  echo -e "   ${YELLOW}nc -z -v $IP_ADDRESS 5000${NC}"
  echo -e "   ${YELLOW}curl http://$IP_ADDRESS:5000${NC}"
  
  echo -e "\n${BLUE}=== KHẮC PHỤC SỰ CỐ ===${NC}"
  echo -e "1. Đảm bảo rằng máy tính của bạn và máy chủ ở cùng mạng LAN"
  echo -e "2. Kiểm tra xem tường lửa đã mở cổng 5000 chưa"
  echo -e "3. Kiểm tra xem máy chủ có bất kỳ phần mềm bảo mật nào chặn kết nối không"
  echo -e "4. Thử tắt tạm thời tường lửa để kiểm tra: ${YELLOW}sudo ufw disable${NC}"
  echo -e "5. Khởi động lại máy chủ nếu cần"
}

# Hàm chính
main() {
  show_banner
  check_root
  
  # Biến kiểm tra vấn đề
  FIX_BINDING=false
  FIX_FIREWALL=false
  FIX_NODEJS=false
  FIX_ENV=false
  
  # Kiểm tra các cấu hình
  check_listening_ports
  check_firewall
  check_nodejs_config
  check_network
  
  # Xác nhận sửa chữa
  echo -e "\n${YELLOW}Bạn có muốn sửa chữa các vấn đề đã phát hiện? (y/n)${NC}"
  read confirmation
  
  if [[ "$confirmation" == "y" || "$confirmation" == "Y" ]]; then
    if [ "$FIX_NODEJS" = true ]; then
      fix_nodejs_config
    fi
    
    if [ "$FIX_ENV" = true ]; then
      fix_env_config
    fi
    
    if [ "$FIX_FIREWALL" = true ]; then
      fix_firewall
    fi
    
    # Khởi động lại ứng dụng để áp dụng các thay đổi
    restart_application
    
    # Chờ ứng dụng khởi động
    log "Chờ ứng dụng khởi động..."
    sleep 5
    
    # Kiểm tra lại
    check_listening_ports
    check_access
  else
    log "Bỏ qua sửa chữa theo yêu cầu của người dùng."
  fi
  
  # Hiển thị thông tin
  show_info
  
  log "Quá trình sửa lỗi hoàn tất. Hãy thử truy cập lại từ máy khác trong mạng LAN."
}

# Thực thi hàm chính
main