"""
Module để tự động phát hiện thiết bị mới theo thời gian thực dựa trên ARP và DHCP
"""

import logging
import time
import threading
from typing import Dict, List, Any, Set, Optional
from datetime import datetime, timedelta

from models import DataStore, ArpEntry, DHCPLease, Device
from mac_vendor import mac_vendor_lookup
import config

logger = logging.getLogger(__name__)

# Lưu trữ thiết bị đã phát hiện
discovered_devices: Dict[str, Dict[str, Any]] = {}

# Khoảng thời gian đánh dấu thiết bị là mới (giây)
NEW_DEVICE_THRESHOLD = 300  # 5 phút

# Khoảng thời gian giữa các lần quét (giây)
SCAN_INTERVAL = 20

# Biến để lưu trữ tham chiếu thread
discovery_thread = None
running = False


def get_all_arp_entries() -> List[ArpEntry]:
    """Lấy danh sách tất cả các mục ARP từ tất cả các thiết bị"""
    all_entries = []
    for device_id, entries in DataStore.arp_entries.items():
        all_entries.extend(entries)
    return all_entries


def get_all_dhcp_leases() -> List[DHCPLease]:
    """Lấy danh sách tất cả các DHCP lease từ tất cả các thiết bị"""
    all_leases = []
    for device_id, leases in DataStore.dhcp_leases.items():
        all_leases.extend(leases)
    return all_leases


def extract_device_info(entry: Any, source_type: str, source_device_id: str) -> Dict[str, Any]:
    """
    Trích xuất thông tin thiết bị từ bản ghi ARP hoặc DHCP
    
    Args:
        entry: Bản ghi ARP hoặc DHCP
        source_type: Loại nguồn ("arp" hoặc "dhcp")
        source_device_id: ID của thiết bị nguồn
    
    Returns:
        Dict[str, Any]: Thông tin thiết bị đã phát hiện
    """
    now = datetime.now()
    
    mac_address = entry.mac_address.upper()
    hostname = ""
    if source_type == "dhcp" and hasattr(entry, "hostname"):
        hostname = entry.hostname
    
    # Lấy thông tin từ MAC address
    vendor = entry.vendor or "Unknown"
    device_type = entry.device_type or "Unknown"
    
    # Kiểm tra lại thông tin vendor nếu chưa có
    if vendor == "Unknown" and mac_address:
        try:
            vendor = mac_vendor_lookup.lookup(mac_address) or "Unknown"
            if vendor != "Unknown":
                device_type = mac_vendor_lookup.get_device_type(vendor)
        except Exception as e:
            logger.warning(f"Error looking up vendor for MAC {mac_address}: {e}")
    
    return {
        "mac_address": mac_address,
        "ip_address": entry.address,
        "hostname": hostname,
        "vendor": vendor,
        "device_type": device_type,
        "first_seen": now,
        "last_seen": now,
        "source": source_type,
        "source_device_id": source_device_id,
        "is_new": True
    }


def detect_new_devices() -> List[Dict[str, Any]]:
    """
    Phát hiện thiết bị mới từ bảng ARP và DHCP leases
    
    Returns:
        List[Dict[str, Any]]: Danh sách thiết bị mới phát hiện
    """
    global discovered_devices
    
    now = datetime.now()
    new_devices = []
    current_macs = set()
    
    # Xử lý bản ghi ARP
    for entry in get_all_arp_entries():
        if not entry.mac_address:
            continue
        
        mac = entry.mac_address.upper()
        current_macs.add(mac)
        
        if mac not in discovered_devices:
            # Thiết bị mới phát hiện
            device_info = extract_device_info(entry, "arp", entry.device_id)
            discovered_devices[mac] = device_info
            new_devices.append(device_info)
            logger.info(f"Phát hiện thiết bị mới từ ARP: {entry.address} ({mac}) - {device_info['vendor']}")
        else:
            # Cập nhật thông tin cho thiết bị đã biết
            discovered_devices[mac]["last_seen"] = now
            discovered_devices[mac]["ip_address"] = entry.address
            
            # Kiểm tra xem thiết bị có được đánh dấu là mới không
            time_diff = now - discovered_devices[mac]["first_seen"]
            if time_diff.total_seconds() < NEW_DEVICE_THRESHOLD:
                discovered_devices[mac]["is_new"] = True
            else:
                discovered_devices[mac]["is_new"] = False
    
    # Xử lý DHCP leases
    for lease in get_all_dhcp_leases():
        if not lease.mac_address:
            continue
        
        mac = lease.mac_address.upper()
        current_macs.add(mac)
        
        if mac not in discovered_devices:
            # Thiết bị mới phát hiện
            device_info = extract_device_info(lease, "dhcp", lease.device_id)
            discovered_devices[mac] = device_info
            new_devices.append(device_info)
            logger.info(f"Phát hiện thiết bị mới từ DHCP: {lease.address} ({mac}) - {device_info['hostname'] or 'Không có tên'}")
        else:
            # Cập nhật thông tin cho thiết bị đã biết
            discovered_devices[mac]["last_seen"] = now
            discovered_devices[mac]["ip_address"] = lease.address
            
            # Cập nhật hostname nếu có từ DHCP
            if lease.hostname and not discovered_devices[mac]["hostname"]:
                discovered_devices[mac]["hostname"] = lease.hostname
                
            # Kiểm tra xem thiết bị có được đánh dấu là mới không
            time_diff = now - discovered_devices[mac]["first_seen"]
            if time_diff.total_seconds() < NEW_DEVICE_THRESHOLD:
                discovered_devices[mac]["is_new"] = True
            else:
                discovered_devices[mac]["is_new"] = False
    
    # Đánh dấu thiết bị không còn hoạt động sau 1 ngày
    inactive_threshold = now - timedelta(days=1)
    for mac, device in list(discovered_devices.items()):
        if device["last_seen"] < inactive_threshold and mac not in current_macs:
            # Xóa thiết bị không hoạt động
            del discovered_devices[mac]
    
    return new_devices


def add_to_monitored_devices(mac_address: str, site_id: str) -> Optional[str]:
    """
    Thêm thiết bị được phát hiện vào danh sách thiết bị được giám sát
    
    Args:
        mac_address: Địa chỉ MAC của thiết bị
        site_id: ID của site
    
    Returns:
        Optional[str]: ID của thiết bị nếu thêm thành công, None nếu không thành công
    """
    if mac_address not in discovered_devices:
        return None
    
    device_info = discovered_devices[mac_address]
    
    # Kiểm tra xem thiết bị đã tồn tại trong danh sách thiết bị được giám sát chưa
    existing_devices = config.get_devices()
    for existing_device in existing_devices:
        if "mac_address" in existing_device and existing_device["mac_address"].upper() == mac_address.upper():
            return existing_device["id"]  # Thiết bị đã tồn tại
    
    # Tạo thiết bị mới
    hostname = device_info.get("hostname", "")
    vendor = device_info.get("vendor", "Unknown")
    
    # Tạo tên thiết bị
    if hostname:
        device_name = hostname
    elif vendor != "Unknown":
        device_name = f"{vendor} - {mac_address[-6:]}"
    else:
        device_name = f"Thiết bị {mac_address[-6:]}"
    
    new_device = {
        "id": None,  # config.add_device sẽ tạo ID
        "name": device_name,
        "host": device_info["ip_address"],
        "mac_address": mac_address,
        "site_id": site_id,
        "port": 8728,  # Cổng mặc định
        "username": "admin",  # Người dùng mặc định
        "password": "",  # Mật khẩu trống
        "enabled": False,  # Tắt theo mặc định để tránh kết nối không thành công
        "use_ssl": False,
        "vendor": vendor,
        "device_type": device_info.get("device_type", "Unknown"),
        "comment": f"Phát hiện tự động từ {device_info['source']} vào {device_info['first_seen'].strftime('%d/%m/%Y %H:%M:%S')}"
    }
    
    # Thêm vào cấu hình
    config.add_device(new_device)
    
    # Lấy ID từ cấu hình
    for device in config.get_devices():
        if device.get("mac_address") == mac_address:
            return device["id"]
    
    return None


def get_discovered_devices(only_new: bool = False) -> List[Dict[str, Any]]:
    """
    Lấy danh sách thiết bị đã phát hiện
    
    Args:
        only_new: Chỉ lấy thiết bị mới
        
    Returns:
        List[Dict[str, Any]]: Danh sách thiết bị đã phát hiện
    """
    result = []
    for mac, device in discovered_devices.items():
        if only_new and not device["is_new"]:
            continue
        result.append(device)
    
    # Sắp xếp theo thời gian phát hiện, mới nhất lên đầu
    result.sort(key=lambda x: x["first_seen"], reverse=True)
    return result


def discovery_worker():
    """Thread worker để thực hiện phát hiện thiết bị liên tục"""
    global running
    
    logger.info("Bắt đầu luồng phát hiện thiết bị thời gian thực")
    
    while running:
        try:
            # Phát hiện thiết bị mới
            new_devices = detect_new_devices()
            
            if new_devices:
                logger.info(f"Phát hiện {len(new_devices)} thiết bị mới")
            
            # Chờ đến lần quét tiếp theo
            time.sleep(SCAN_INTERVAL)
        
        except Exception as e:
            logger.error(f"Lỗi trong quá trình phát hiện thiết bị thời gian thực: {str(e)}")
            time.sleep(SCAN_INTERVAL)


def start_discovery():
    """Bắt đầu quá trình phát hiện thiết bị tự động"""
    global discovery_thread, running
    
    if discovery_thread and discovery_thread.is_alive():
        logger.info("Luồng phát hiện thiết bị đã đang chạy")
        return
    
    running = True
    discovery_thread = threading.Thread(target=discovery_worker, daemon=True)
    discovery_thread.start()
    logger.info("Đã bắt đầu luồng phát hiện thiết bị thời gian thực")


def stop_discovery():
    """Dừng quá trình phát hiện thiết bị tự động"""
    global running
    
    running = False
    logger.info("Đã gửi tín hiệu dừng cho luồng phát hiện thiết bị thời gian thực")