import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Device } from '@shared/schema';

interface DeviceInfoTestProps {
  deviceId: number;
}

const DeviceInfoTest: React.FC<DeviceInfoTestProps> = ({ deviceId }) => {
  // Fetch device info with explicit URL
  const { data: device, isLoading, error } = useQuery<Device>({ 
    queryKey: [`/api/devices/${deviceId}`],
    enabled: !!deviceId,
  });

  if (isLoading) return <div>Loading device information...</div>;
  if (error) return <div>Error loading device: {String(error)}</div>;
  if (!device) return <div>No device data available</div>;

  return (
    <div className="bg-gray-900 p-4 rounded-lg">
      <h2 className="text-xl text-white mb-4">Device Information Test</h2>
      
      <pre className="bg-gray-800 p-4 rounded text-green-400 overflow-auto max-h-[500px]">
        {JSON.stringify(device, null, 2)}
      </pre>

      <div className="grid grid-cols-2 gap-4 mt-4">
        <div className="bg-gray-800 p-2 rounded">
          <span className="text-gray-400">Name:</span>
          <span className="text-green-400 ml-2">{device.name}</span>
        </div>
        
        <div className="bg-gray-800 p-2 rounded">
          <span className="text-gray-400">Model:</span>
          <span className="text-green-400 ml-2">{device.model || 'Unknown'}</span>
        </div>
        
        <div className="bg-gray-800 p-2 rounded">
          <span className="text-gray-400">RouterOS:</span>
          <span className="text-green-400 ml-2">{device.routerOsVersion || 'Unknown'}</span>
        </div>
        
        <div className="bg-gray-800 p-2 rounded">
          <span className="text-gray-400">Firmware:</span>
          <span className="text-green-400 ml-2">{device.firmware || 'Unknown'}</span>
        </div>
        
        <div className="bg-gray-800 p-2 rounded">
          <span className="text-gray-400">Uptime:</span>
          <span className="text-green-400 ml-2">{device.uptime || 'Unknown'}</span>
        </div>
        
        <div className="bg-gray-800 p-2 rounded">
          <span className="text-gray-400">Status:</span>
          <span className={`${device.isOnline ? 'text-green-400' : 'text-red-400'} ml-2`}>
            {device.isOnline ? 'Online' : 'Offline'}
          </span>
        </div>
      </div>
    </div>
  );
};

export default DeviceInfoTest;