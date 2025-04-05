"""
Module để tự động phát hiện các thiết bị Mikrotik trong mạng
"""

import ipaddress
import threading
import socket
import logging
import time
import uuid
import routeros_api
from typing import List, Dict, Any, Optional, Tuple
import concurrent.futures
from models import DataStore, Device
import config

logger = logging.getLogger(__name__)

def scan_network(network_range: str, username: str, password: str, port: int = 8728,
                 timeout: int = 3, max_workers: int = 20) -> List[Dict[str, Any]]:
    """
    Quét một dải mạng để tìm thiết bị Mikrotik
    
    Args:
        network_range: Dải mạng cần quét (định dạng CIDR, ví dụ: 192.168.88.0/24)
        username: Tên đăng nhập cho thiết bị Mikrotik
        password: Mật khẩu cho thiết bị Mikrotik
        port: Cổng kết nối API Mikrotik (mặc định 8728)
        timeout: Thời gian timeout cho mỗi lần kết nối (giây)
        max_workers: Số luồng tối đa để quét song song
        
    Returns:
        List[Dict[str, Any]]: Danh sách thông tin các thiết bị Mikrotik tìm thấy
    """
    network = ipaddress.ip_network(network_range)
    all_ips = list(network.hosts())
    
    logger.info(f"Bắt đầu quét mạng {network_range}, tổng số {len(all_ips)} địa chỉ IP")
    
    found_devices = []
    
    # Sử dụng ThreadPoolExecutor để quét song song
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_ip = {
            executor.submit(check_mikrotik_device, str(ip), username, password, port, timeout): ip 
            for ip in all_ips
        }
        
        for future in concurrent.futures.as_completed(future_to_ip):
            ip = future_to_ip[future]
            try:
                device_info = future.result()
                if device_info:
                    logger.info(f"Tìm thấy thiết bị Mikrotik tại {ip}")
                    found_devices.append(device_info)
            except Exception as e:
                logger.debug(f"Lỗi khi quét {ip}: {str(e)}")
    
    logger.info(f"Hoàn tất quét mạng, tìm thấy {len(found_devices)} thiết bị Mikrotik")
    return found_devices

def check_mikrotik_device(ip: str, username: str, password: str, port: int = 8728, 
                          timeout: int = 3) -> Optional[Dict[str, Any]]:
    """
    Kiểm tra xem một địa chỉ IP có phải là thiết bị Mikrotik không
    
    Args:
        ip: Địa chỉ IP cần kiểm tra
        username: Tên đăng nhập
        password: Mật khẩu
        port: Cổng kết nối (mặc định 8728)
        timeout: Thời gian timeout cho kết nối (giây)
        
    Returns:
        Optional[Dict[str, Any]]: Thông tin thiết bị nếu là Mikrotik, None nếu không phải
    """
    # Kiểm tra xem cổng RouterOS API có mở không
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(timeout)
    
    try:
        result = sock.connect_ex((ip, port))
        if result != 0:
            # Cổng không mở, không phải RouterOS API
            return None
        sock.close()
        
        # Thử kết nối đến RouterOS API
        conn = routeros_api.RouterOsApiPool(
            ip,
            username=username,
            password=password,
            port=port,
            plaintext_login=True
        )
        api = conn.get_api()
        
        # Lấy thông tin thiết bị
        system_resource = api.get_resource('/system/resource')
        identity_resource = api.get_resource('/system/identity')
        
        resources = system_resource.get()[0]
        identity = identity_resource.get()[0]
        
        # Tạo thông tin thiết bị
        device_info = {
            'id': str(uuid.uuid4()),
            'name': identity.get('name', 'Unknown Mikrotik'),
            'host': ip,
            'port': port,
            'username': username,
            'password': password,
            'board_name': resources.get('board-name', 'Unknown'),
            'version': resources.get('version', 'Unknown'),
            'enabled': True,
            'use_ssl': False
        }
        
        # Đóng kết nối
        conn.disconnect()
        return device_info
        
    except Exception as e:
        logger.debug(f"Không thể kết nối đến {ip}:{port} - {str(e)}")
        return None
    finally:
        sock.close()

def add_discovered_devices(devices: List[Dict[str, Any]], site_id: str) -> Tuple[int, int]:
    """
    Thêm các thiết bị được phát hiện vào hệ thống
    
    Args:
        devices: Danh sách thông tin các thiết bị Mikrotik tìm thấy
        site_id: ID của site để thêm thiết bị vào
        
    Returns:
        Tuple[int, int]: (Số thiết bị mới, Số thiết bị đã tồn tại)
    """
    new_count = 0
    existing_count = 0
    existing_devices = config.get_devices()
    
    for device_info in devices:
        # Kiểm tra xem thiết bị đã tồn tại hay chưa (theo địa chỉ IP)
        is_existing = False
        for existing_device in existing_devices:
            if existing_device['host'] == device_info['host']:
                is_existing = True
                existing_count += 1
                break
        
        if not is_existing:
            # Thêm site_id vào thiết bị
            device_info['site_id'] = site_id
            
            # Thêm vào cấu hình
            config.add_device(device_info)
            new_count += 1
            logger.info(f"Đã thêm thiết bị mới: {device_info['name']} ({device_info['host']})")
    
    return new_count, existing_count

def run_discovery(network_ranges: List[str], username: str, password: str, site_id: str, 
                 port: int = 8728, timeout: int = 3) -> Dict[str, Any]:
    """
    Chạy quá trình phát hiện thiết bị trên nhiều dải mạng
    
    Args:
        network_ranges: Danh sách các dải mạng cần quét
        username: Tên đăng nhập mặc định
        password: Mật khẩu mặc định
        site_id: ID của site để thêm thiết bị vào
        port: Cổng kết nối API (mặc định 8728)
        timeout: Thời gian timeout (giây)
        
    Returns:
        Dict[str, Any]: Kết quả phát hiện thiết bị
    """
    all_devices = []
    
    for network_range in network_ranges:
        try:
            devices = scan_network(network_range, username, password, port, timeout)
            all_devices.extend(devices)
        except Exception as e:
            logger.error(f"Lỗi khi quét dải mạng {network_range}: {str(e)}")
    
    # Thêm thiết bị vào hệ thống
    new_count, existing_count = add_discovered_devices(all_devices, site_id)
    
    # Kết quả
    result = {
        'total_found': len(all_devices),
        'new_devices': new_count,
        'existing_devices': existing_count,
        'devices': all_devices
    }
    
    return result