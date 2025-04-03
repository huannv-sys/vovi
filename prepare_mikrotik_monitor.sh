#!/bin/bash

# Script chuẩn bị file cài đặt Mikrotik Monitoring
# Tác giả: Expert Developer
# Phiên bản: 1.0
# -----------------------------------------------------------------------------

# Thiết lập môi trường
set -e
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color
OUTPUT_DIR="$(pwd)/mikrotik-monitor-package"

# Hàm hiển thị lỗi
error() {
  echo -e "${RED}[ERROR] $1${NC}"
  exit 1
}

# Hàm chuẩn bị dữ liệu
prepare_package() {
  echo -e "${GREEN}=== BẮT ĐẦU CHUẨN BỊ GÓI CÀI ĐẶT MIKROTIK MONITORING ===${NC}"
  
  # Tạo thư mục đầu ra nếu chưa tồn tại
  mkdir -p $OUTPUT_DIR || error "Không thể tạo thư mục đầu ra"
  
  # Tạo cấu trúc thư mục
  echo -e "${YELLOW}Tạo cấu trúc thư mục...${NC}"
  mkdir -p $OUTPUT_DIR/mikrotik-monitoring || error "Không thể tạo cấu trúc thư mục"
  
  # Sao chép tất cả các tệp vào thư mục gói
  echo -e "${YELLOW}Sao chép tệp dự án...${NC}"
  cp -r ./client $OUTPUT_DIR/mikrotik-monitoring/ || error "Không thể sao chép thư mục client"
  cp -r ./server $OUTPUT_DIR/mikrotik-monitoring/ || error "Không thể sao chép thư mục server"
  cp -r ./shared $OUTPUT_DIR/mikrotik-monitoring/ || error "Không thể sao chép thư mục shared"
  cp ./package.json $OUTPUT_DIR/mikrotik-monitoring/ || error "Không thể sao chép package.json"
  cp ./package-lock.json $OUTPUT_DIR/mikrotik-monitoring/ || error "Không thể sao chép package-lock.json"
  cp ./drizzle.config.ts $OUTPUT_DIR/mikrotik-monitoring/ || error "Không thể sao chép drizzle.config.ts"
  cp ./postcss.config.js $OUTPUT_DIR/mikrotik-monitoring/ || error "Không thể sao chép postcss.config.js"
  cp ./tailwind.config.ts $OUTPUT_DIR/mikrotik-monitoring/ || error "Không thể sao chép tailwind.config.ts"
  cp ./theme.json $OUTPUT_DIR/mikrotik-monitoring/ || error "Không thể sao chép theme.json"
  cp ./tsconfig.json $OUTPUT_DIR/mikrotik-monitoring/ || error "Không thể sao chép tsconfig.json"
  cp ./vite.config.ts $OUTPUT_DIR/mikrotik-monitoring/ || error "Không thể sao chép vite.config.ts"
  
  # Sao chép script cài đặt
  echo -e "${YELLOW}Sao chép script cài đặt...${NC}"
  cp ./install_mikrotik_monitor.sh $OUTPUT_DIR/ || error "Không thể sao chép script cài đặt"
  chmod +x $OUTPUT_DIR/install_mikrotik_monitor.sh || error "Không thể đặt quyền thực thi cho script cài đặt"
  
  # Tạo tệp README.md với hướng dẫn
  cat > $OUTPUT_DIR/README.md << EOF
# Mikrotik Monitoring

## Hướng dẫn cài đặt

### Yêu cầu hệ thống
- Ubuntu 20.04 hoặc mới hơn
- Ít nhất 2GB RAM
- Ít nhất 10GB dung lượng đĩa trống

### Các bước cài đặt

1. Giải nén gói cài đặt:
   \`\`\`bash
   unzip mikrotik-monitor-package.zip
   \`\`\`

2. Di chuyển vào thư mục đã giải nén:
   \`\`\`bash
   cd mikrotik-monitor-package
   \`\`\`

3. Đặt quyền thực thi cho script cài đặt (nếu cần):
   \`\`\`bash
   chmod +x install_mikrotik_monitor.sh
   \`\`\`

4. Chạy script cài đặt:
   \`\`\`bash
   sudo ./install_mikrotik_monitor.sh
   \`\`\`

5. Làm theo các hướng dẫn trên màn hình để hoàn tất quá trình cài đặt.

## Sử dụng

- Sau khi cài đặt, bạn có thể truy cập ứng dụng qua trình duyệt tại địa chỉ: http://<địa_chỉ_IP_máy_chủ>:5000
- Đăng nhập và thêm thiết bị Mikrotik của bạn để bắt đầu giám sát.
- Sử dụng các lệnh PM2 để quản lý ứng dụng (như được liệt kê trong thông báo sau khi cài đặt hoàn tất).

## Khắc phục sự cố

Nếu bạn gặp vấn đề trong quá trình cài đặt, hãy kiểm tra file log tại:
\`\`\`
/var/log/mikrotik-monitor-install.log
\`\`\`

## Tính năng

- Giám sát trực tiếp các thiết bị Mikrotik
- Theo dõi CPU, bộ nhớ, nhiệt độ và các thông số khác
- Hiển thị thông tin về giao diện mạng và luồng dữ liệu
- Giám sát CAPsMAN và các điểm truy cập không dây
- Hệ thống cảnh báo và thông báo
EOF
  
  # Nén gói
  echo -e "${YELLOW}Nén gói cài đặt...${NC}"
  cd $(dirname $OUTPUT_DIR)
  zip -r mikrotik-monitor-package.zip $(basename $OUTPUT_DIR) || error "Không thể nén gói cài đặt"
  
  # Hoàn tất
  echo -e "\n${GREEN}=== CHUẨN BỊ GÓI CÀI ĐẶT HOÀN TẤT ===${NC}"
  echo -e "Gói cài đặt đã được tạo tại: ${YELLOW}$(pwd)/mikrotik-monitor-package.zip${NC}"
  echo -e "Hãy sao chép file này sang máy Ubuntu của bạn và làm theo hướng dẫn trong README.md\n"
}

# Thực thi hàm chính
prepare_package