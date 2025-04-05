import logging
import requests
import json
import os
import time
from typing import Dict, Optional, Tuple

# Cấu hình logging
logger = logging.getLogger(__name__)

# Đường dẫn đến file cache
CACHE_FILE = "mac_vendors_cache.json"
CACHE_EXPIRY = 30 * 24 * 60 * 60  # 30 ngày tính bằng giây

# API URLs cho tra cứu MAC
API_URLS = [
    "https://api.macvendors.com/",
    "https://api.maclookup.app/v2/macs/"
]

class MacVendorLookup:
    def __init__(self):
        self.cache = self._load_cache()
        self.last_request_time = 0
        self.request_interval = 1  # Khoảng thời gian tối thiểu giữa các request (giây)

    def _load_cache(self) -> Dict[str, Tuple[str, float]]:
        """Tải cache từ file"""
        if os.path.exists(CACHE_FILE):
            try:
                with open(CACHE_FILE, 'r') as f:
                    data = json.load(f)
                    # Chuyển đổi dữ liệu cũ (nếu có) sang định dạng mới
                    result = {}
                    for mac, value in data.items():
                        if isinstance(value, str):
                            result[mac] = (value, time.time())
                        else:
                            result[mac] = tuple(value)
                    return result
            except (json.JSONDecodeError, IOError) as e:
                logger.error(f"Lỗi khi đọc cache MAC: {e}")
                return {}
        return {}

    def _save_cache(self) -> None:
        """Lưu cache vào file"""
        try:
            with open(CACHE_FILE, 'w') as f:
                json.dump(self.cache, f)
        except IOError as e:
            logger.error(f"Lỗi khi lưu cache MAC: {e}")

    def _normalize_mac(self, mac: str) -> str:
        """Chuẩn hóa định dạng MAC address"""
        mac = mac.upper()
        mac = ''.join(c for c in mac if c.isalnum())
        
        # Đảm bảo MAC address có độ dài đúng (12 ký tự không bao gồm dấu phân cách)
        if len(mac) < 6:
            return ""
            
        # Lấy 6 ký tự đầu tiên (OUI - Organizationally Unique Identifier)
        return mac[:6]

    def lookup(self, mac: str) -> Optional[str]:
        """Tra cứu nhà sản xuất từ MAC address"""
        if not mac:
            return None
            
        normalized_mac = self._normalize_mac(mac)
        if not normalized_mac:
            return None
            
        # Kiểm tra cache
        current_time = time.time()
        if normalized_mac in self.cache:
            vendor, timestamp = self.cache[normalized_mac]
            # Kiểm tra xem cache có hết hạn chưa
            if current_time - timestamp < CACHE_EXPIRY:
                return vendor
        
        # Tránh gửi quá nhiều request trong thời gian ngắn
        if current_time - self.last_request_time < self.request_interval:
            time.sleep(self.request_interval - (current_time - self.last_request_time))
        
        vendor = self._lookup_online(normalized_mac)
        self.last_request_time = time.time()
        
        if vendor:
            # Lưu vào cache
            self.cache[normalized_mac] = (vendor, current_time)
            self._save_cache()
            
        return vendor

    def _lookup_online(self, mac: str) -> Optional[str]:
        """Tra cứu MAC address từ API online"""
        for api_url in API_URLS:
            try:
                url = f"{api_url}{mac}"
                headers = {"User-Agent": "MikrotikMonitor/1.0"}
                
                response = requests.get(url, headers=headers, timeout=5)
                
                if response.status_code == 200:
                    # Xử lý phản hồi dựa trên API
                    if "maclookup.app" in api_url:
                        data = response.json()
                        if data.get("success") and data.get("data"):
                            return data.get("data", {}).get("vendor", "Unknown")
                    else:
                        # Giả định API trả về văn bản thuần túy
                        return response.text.strip()
                    
            except Exception as e:
                logger.warning(f"Lỗi khi truy vấn API {api_url} cho MAC {mac}: {e}")
                continue
                
        return "Unknown"

    def get_device_type(self, vendor: str) -> str:
        """Ước tính loại thiết bị dựa trên nhà sản xuất"""
        vendor_lower = vendor.lower()
        
        # Điện thoại di động
        if any(name in vendor_lower for name in ["apple", "samsung", "xiaomi", "oppo", "vivo", "huawei", "oneplus"]):
            return "Điện thoại"
            
        # Máy tính
        if any(name in vendor_lower for name in ["dell", "hp", "lenovo", "asus", "acer", "intel", "microsoft"]):
            return "Máy tính"
            
        # Thiết bị mạng
        if any(name in vendor_lower for name in ["cisco", "juniper", "aruba", "mikrotik", "ubiquiti", "tplink", "tp-link", "d-link", "netgear"]):
            return "Thiết bị mạng"
            
        # Smart TV
        if any(name in vendor_lower for name in ["sony", "samsung", "lg", "hisense", "tcl", "panasonic", "sharp", "philips"]):
            return "Smart TV"
            
        # IoT & thiết bị thông minh
        if any(name in vendor_lower for name in ["nest", "ring", "ecobee", "sonos", "honeywell", "broadlink", "tuya"]):
            return "Thiết bị thông minh"
            
        return "Khác"

# Singleton instance
mac_vendor_lookup = MacVendorLookup()