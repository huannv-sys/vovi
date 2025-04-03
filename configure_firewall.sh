#!/bin/bash

# Script cấu hình firewall cho Mikrotik Monitoring Server
# Tác giả: Huân NV - Expert Developer
# Phiên bản: 1.0
# -----------------------------------------------------------------------------

# Thiết lập môi trường
set -e
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color
LOG_FILE="/var/log/mikrotik-monitor-firewall.log"

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
  echo "║                MIKROTIK MONITORING FIREWALL                ║"
  echo "║                  Cấu hình Firewall Server                  ║"
  echo "╚════════════════════════════════════════════════════════════╝"
  echo -e "${NC}"
}

# Kiểm tra xem UFW đã được cài đặt chưa
check_ufw() {
  log "Kiểm tra UFW Firewall..."
  
  if ! command -v ufw &> /dev/null; then
    log "UFW chưa được cài đặt. Đang cài đặt UFW..."
    sudo apt-get update -qq
    sudo apt-get install -qq -y ufw
  else
    log "UFW đã được cài đặt."
  fi
}

# Đặt lại cấu hình UFW về mặc định
reset_ufw() {
  log "Đặt lại cấu hình UFW về mặc định..."
  
  # Tắt UFW trước khi đặt lại
  sudo ufw --force disable
  
  # Đặt lại cấu hình về mặc định
  sudo ufw --force reset
  
  # Đặt chính sách mặc định (deny incoming, allow outgoing)
  sudo ufw default deny incoming
  sudo ufw default allow outgoing
  
  log "Đã đặt lại cấu hình UFW thành công."
}

# Cấu hình quy tắc firewall
configure_rules() {
  log "Cấu hình quy tắc firewall..."
  
  # Luôn cho phép SSH để tránh bị khóa khỏi máy chủ
  sudo ufw allow ssh comment 'Allow SSH'
  log "✓ Cho phép SSH (cổng 22)"
  
  # Cho phép cổng HTTP và HTTPS cho web server (nếu cần)
  sudo ufw allow http comment 'Allow HTTP'
  sudo ufw allow https comment 'Allow HTTPS'
  log "✓ Cho phép HTTP (cổng 80) và HTTPS (cổng 443)"
  
  # Cho phép cổng 5000 cho Mikrotik Monitoring
  sudo ufw allow 5000/tcp comment 'Allow Mikrotik Monitoring Web UI'
  log "✓ Cho phép Mikrotik Monitoring Web UI (cổng 5000)"
  
  # Cho phép cổng 8728 và 8729 để kết nối với thiết bị Mikrotik (API)
  sudo ufw allow 8728/tcp comment 'Allow Mikrotik API'
  sudo ufw allow 8729/tcp comment 'Allow Mikrotik API Secure'
  log "✓ Cho phép Mikrotik API (cổng 8728, 8729)"
  
  # Cho phép Ping (ICMP)
  sudo ufw allow icmp comment 'Allow Ping'
  log "✓ Cho phép ICMP (Ping)"
  
  # Nếu bạn sử dụng PostgreSQL, bạn có thể hạn chế truy cập vào cổng PostgreSQL
  # từ địa chỉ IP cụ thể (hoặc không cho phép từ bên ngoài)
  sudo ufw deny 5432/tcp comment 'Deny PostgreSQL from outside'
  log "✓ Chặn truy cập PostgreSQL từ bên ngoài (cổng 5432)"
  
  log "Cấu hình quy tắc firewall đã hoàn tất."
}

# Tạo quy tắc nâng cao
configure_advanced_rules() {
  echo -e "${YELLOW}Bạn có muốn cấu hình quy tắc firewall nâng cao? (y/n)${NC}"
  read answer
  
  if [[ "$answer" == "y" || "$answer" == "Y" ]]; then
    log "Cấu hình quy tắc firewall nâng cao..."
    
    # Chặn truy cập từ các IP đáng ngờ (thay thế bằng IP thực nếu cần)
    echo -e "${YELLOW}Nhập địa chỉ IP muốn chặn (để trống nếu không có):${NC}"
    read block_ip
    
    if [[ -n "$block_ip" ]]; then
      sudo ufw deny from $block_ip comment 'Blocked suspicious IP'
      log "✓ Đã chặn địa chỉ IP: $block_ip"
    fi
    
    # Giới hạn số lượng kết nối
    sudo bash -c 'cat > /etc/ufw/before.rules' << 'EOF'
# Các quy tắc mặc định của UFW
*filter
:ufw-before-input - [0:0]
:ufw-before-output - [0:0]
:ufw-before-forward - [0:0]
:ufw-not-local - [0:0]

# Cho phép lưu lượng trên giao diện loopback
-A ufw-before-input -i lo -j ACCEPT
-A ufw-before-output -o lo -j ACCEPT

# Nhanh chóng xử lý các gói tin đã được thiết lập
-A ufw-before-input -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT
-A ufw-before-output -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT
-A ufw-before-forward -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT

# Chặn gói tin không hợp lệ
-A ufw-before-input -m conntrack --ctstate INVALID -j DROP

# Cho phép ICMP
-A ufw-before-input -p icmp --icmp-type destination-unreachable -j ACCEPT
-A ufw-before-input -p icmp --icmp-type time-exceeded -j ACCEPT
-A ufw-before-input -p icmp --icmp-type parameter-problem -j ACCEPT
-A ufw-before-input -p icmp --icmp-type echo-request -j ACCEPT

# Cho phép broadcast DHCP
-A ufw-before-input -p udp --sport 67 --dport 68 -j ACCEPT

# Không theo dõi multicast
-A ufw-before-input -s 224.0.0.0/4 -j ACCEPT
-A ufw-before-input -d 224.0.0.0/4 -j ACCEPT

# Không theo dõi broadcast
-A ufw-before-input -d 255.255.255.255 -j ACCEPT

# Rate limiting: Giới hạn 6 kết nối mới mỗi 30 giây đến cổng 22 (SSH)
-A ufw-before-input -p tcp --dport 22 -m state --state NEW -m recent --set
-A ufw-before-input -p tcp --dport 22 -m state --state NEW -m recent --update --seconds 30 --hitcount 6 -j DROP

# Rate limiting: Giới hạn 20 kết nối mới mỗi 30 giây đến cổng 5000 (Mikrotik Monitoring)
-A ufw-before-input -p tcp --dport 5000 -m state --state NEW -m recent --set
-A ufw-before-input -p tcp --dport 5000 -m state --state NEW -m recent --update --seconds 30 --hitcount 20 -j DROP

# Đánh dấu địa chỉ không phải là unicast
-A ufw-before-input -m addrtype --dst-type BROADCAST -j ACCEPT
-A ufw-before-input -m addrtype --dst-type MULTICAST -j ACCEPT
-A ufw-before-input -m addrtype --dst-type ANYCAST -j ACCEPT
-A ufw-before-input -m addrtype --dst-type LOCAL -j ACCEPT
-A ufw-before-input -m addrtype --dst-type UNSPEC -j ACCEPT

# Không theo dõi địa chỉ không phải là unicast
-A ufw-before-input ! -p tcp -m addrtype --dst-type MULTICAST -j ACCEPT
-A ufw-before-input ! -p tcp -m addrtype --dst-type BROADCAST -j ACCEPT

COMMIT

# Các quy tắc NAT (Uncomment nếu bạn muốn sử dụng NAT)
# *nat
# :POSTROUTING ACCEPT [0:0]
# Ví dụ về NAT: -A POSTROUTING -s 192.168.0.0/16 -o eth0 -j MASQUERADE
# COMMIT

# Không theo dõi các cài đặt mangle
*mangle
:PREROUTING ACCEPT [0:0]
:INPUT ACCEPT [0:0]
:FORWARD ACCEPT [0:0]
:OUTPUT ACCEPT [0:0]
:POSTROUTING ACCEPT [0:0]
COMMIT

# Các quy tắc raw
*raw
:PREROUTING ACCEPT [0:0]
:OUTPUT ACCEPT [0:0]
COMMIT
EOF
    
    log "✓ Đã cấu hình giới hạn kết nối và các quy tắc nâng cao"
    
    # Kiểm tra cấu hình
    sudo ufw show raw
    
    log "Cấu hình quy tắc firewall nâng cao đã hoàn tất."
  else
    log "Bỏ qua cấu hình quy tắc firewall nâng cao."
  fi
}

# Bật UFW
enable_ufw() {
  log "Bật UFW Firewall..."
  
  # Bật UFW với tùy chọn --force để không yêu cầu xác nhận
  sudo ufw --force enable
  
  # Kiểm tra trạng thái
  sudo ufw status verbose
  
  log "UFW Firewall đã được bật thành công."
}

# Xử lý cấu hình failsafe để tránh bị khóa khỏi máy chủ
setup_failsafe() {
  log "Thiết lập failsafe để tránh bị khóa khỏi máy chủ..."
  
  # Tạo script để tự động tắt UFW sau một khoảng thời gian nếu không thể truy cập
  sudo bash -c 'cat > /usr/local/bin/ufw-failsafe.sh' << 'EOF'
#!/bin/bash
# Script tự động tắt UFW sau 10 phút nếu không được hủy
echo "WARNING: UFW sẽ bị tắt sau 10 phút nếu bạn không hủy quá trình này"
echo "Nhấn Ctrl+C để hủy nếu bạn vẫn có thể truy cập máy chủ"
echo "Đang đếm ngược..."

for i in {600..1}; do
  echo -ne "Còn lại $i giây...\r"
  sleep 1
done

echo "Tắt UFW để khôi phục truy cập..."
ufw disable
echo "UFW đã được tắt. Bạn có thể truy cập lại máy chủ."
EOF
  
  sudo chmod +x /usr/local/bin/ufw-failsafe.sh
  
  log "✓ Đã tạo script failsafe tại /usr/local/bin/ufw-failsafe.sh"
  log "✓ Để sử dụng, hãy chạy 'sudo /usr/local/bin/ufw-failsafe.sh' trước khi thực hiện thay đổi lớn với firewall"
}

# Hướng dẫn sử dụng và các lệnh phổ biến
show_usage_guide() {
  echo -e "\n${BLUE}=== HƯỚNG DẪN SỬ DỤNG FIREWALL ===${NC}"
  echo -e "Các lệnh phổ biến để quản lý firewall:"
  echo -e " ${YELLOW}sudo ufw status${NC} - Xem trạng thái và quy tắc hiện tại"
  echo -e " ${YELLOW}sudo ufw status verbose${NC} - Xem trạng thái chi tiết"
  echo -e " ${YELLOW}sudo ufw allow 8080/tcp${NC} - Mở cổng 8080 TCP"
  echo -e " ${YELLOW}sudo ufw deny 8080/tcp${NC} - Chặn cổng 8080 TCP"
  echo -e " ${YELLOW}sudo ufw delete allow 8080/tcp${NC} - Xóa quy tắc cho cổng 8080 TCP"
  echo -e " ${YELLOW}sudo ufw allow from 192.168.1.0/24${NC} - Cho phép từ dải IP"
  echo -e " ${YELLOW}sudo ufw deny from 10.0.0.5${NC} - Chặn một địa chỉ IP cụ thể"
  echo -e " ${YELLOW}sudo ufw enable${NC} - Bật firewall"
  echo -e " ${YELLOW}sudo ufw disable${NC} - Tắt firewall"
  echo -e " ${YELLOW}sudo ufw reset${NC} - Đặt lại cấu hình firewall\n"
  echo -e " ${YELLOW}sudo /usr/local/bin/ufw-failsafe.sh${NC} - Chạy script failsafe\n"
  echo -e "Để xem nhật ký của firewall, sử dụng: ${YELLOW}sudo cat /var/log/ufw.log${NC}"
  echo -e "Nhật ký cấu hình của script này: ${YELLOW}$LOG_FILE${NC}\n"
}

# Hàm chính
main() {
  # Kiểm tra quyền root
  if [[ $EUID -ne 0 ]]; then
    error "Script này phải được chạy với quyền sudo hoặc root"
  fi
  
  show_banner
  
  # Xác nhận trước khi tiếp tục
  echo -e "${YELLOW}Script này sẽ cấu hình UFW Firewall cho Mikrotik Monitoring Server."
  echo -e "Điều này có thể ảnh hưởng đến kết nối hiện tại. Tiếp tục? (y/n)${NC}"
  read confirmation
  
  if [[ "$confirmation" != "y" && "$confirmation" != "Y" ]]; then
    echo -e "${RED}Đã hủy bỏ.${NC}"
    exit 0
  fi
  
  check_ufw
  reset_ufw
  configure_rules
  configure_advanced_rules
  setup_failsafe
  enable_ufw
  show_usage_guide
  
  echo -e "\n${GREEN}=== CẤU HÌNH FIREWALL HOÀN TẤT ===${NC}"
  echo -e "Firewall đã được cấu hình và kích hoạt thành công."
  echo -e "Mikrotik Monitoring Server được bảo vệ với các quy tắc bảo mật.\n"
}

# Thực thi hàm main
main