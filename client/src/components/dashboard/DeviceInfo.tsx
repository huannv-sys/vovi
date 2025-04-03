import { useQuery } from "@tanstack/react-query";
import { Device } from "@shared/schema";

interface DeviceInfoProps {
  deviceId: number | null;
}

const DeviceInfo: React.FC<DeviceInfoProps> = ({ deviceId }) => {
  const { data: device, isLoading } = useQuery<Device>({ 
    queryKey: deviceId ? [`/api/devices/${deviceId}`] : null,
    enabled: !!deviceId,
  });
  
  const formatLastSeen = (date: string | Date | null | undefined) => {
    if (!date) return 'Never';
    
    const lastSeen = new Date(date);
    return lastSeen.toLocaleString();
  };
  
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="px-4 py-3 border-b border-gray-200">
        <h3 className="font-medium text-neutral-dark">Device Information</h3>
      </div>
      <div className="p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-24">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          </div>
        ) : device ? (
          <div className="grid grid-cols-1 gap-4">
            <div className="flex">
              <div className="w-1/3 text-sm text-gray-500">Model</div>
              <div className="w-2/3 text-sm font-medium text-neutral-dark">
                {device.model || 'Unknown'}
              </div>
            </div>
            <div className="flex">
              <div className="w-1/3 text-sm text-gray-500">Serial Number</div>
              <div className="w-2/3 text-sm font-medium text-neutral-dark">
                {device.serialNumber || 'Unknown'}
              </div>
            </div>
            <div className="flex">
              <div className="w-1/3 text-sm text-gray-500">RouterOS Version</div>
              <div className="w-2/3 text-sm font-medium text-neutral-dark">
                {device.routerOsVersion || 'Unknown'}
              </div>
            </div>
            <div className="flex">
              <div className="w-1/3 text-sm text-gray-500">Firmware</div>
              <div className="w-2/3 text-sm font-medium text-neutral-dark">
                {device.firmware || 'Unknown'}
              </div>
            </div>
            <div className="flex">
              <div className="w-1/3 text-sm text-gray-500">CPU</div>
              <div className="w-2/3 text-sm font-medium text-neutral-dark">
                {device.cpu || 'Unknown'}
              </div>
            </div>
            <div className="flex">
              <div className="w-1/3 text-sm text-gray-500">Total Memory</div>
              <div className="w-2/3 text-sm font-medium text-neutral-dark">
                {device.totalMemory || 'Unknown'}
              </div>
            </div>
            <div className="flex">
              <div className="w-1/3 text-sm text-gray-500">Storage</div>
              <div className="w-2/3 text-sm font-medium text-neutral-dark">
                {device.storage || 'Unknown'}
              </div>
            </div>
            <div className="flex">
              <div className="w-1/3 text-sm text-gray-500">Last Updated</div>
              <div className="w-2/3 text-sm font-medium text-neutral-dark">
                {formatLastSeen(device.lastSeen)}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-gray-500 text-center py-8">
            No device information available
          </div>
        )}
      </div>
    </div>
  );
};

export default DeviceInfo;
