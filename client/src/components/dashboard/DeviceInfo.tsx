import { useQuery } from "@tanstack/react-query";
import { Device } from "@shared/schema";

interface DeviceInfoProps {
  deviceId: number | null;
}

const DeviceInfo: React.FC<DeviceInfoProps> = ({ deviceId }) => {
  const { data: device, isLoading } = useQuery<Device>({ 
    queryKey: deviceId ? ['/api/devices', deviceId] : ['/api/devices'],
    enabled: !!deviceId,
  });
  
  const formatLastSeen = (date: string | Date | null | undefined) => {
    if (!date) return 'Never';
    
    const lastSeen = new Date(date);
    return lastSeen.toLocaleString();
  };
  
  return (
    <div className="bg-slate-800 rounded-lg shadow-sm border border-slate-700">
      <div className="px-4 py-3 border-b border-slate-700">
        <h3 className="font-medium text-white">Device Information</h3>
      </div>
      <div className="p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-24">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          </div>
        ) : device ? (
          <div className="grid grid-cols-1 gap-4">
            <div className="flex">
              <div className="w-1/3 text-sm text-slate-400">Model</div>
              <div className="w-2/3 text-sm font-medium text-white">
                {device.model || 'Unknown'}
              </div>
            </div>
            <div className="flex">
              <div className="w-1/3 text-sm text-slate-400">Serial Number</div>
              <div className="w-2/3 text-sm font-medium text-white">
                {device.serialNumber || 'Unknown'}
              </div>
            </div>
            <div className="flex">
              <div className="w-1/3 text-sm text-slate-400">RouterOS Version</div>
              <div className="w-2/3 text-sm font-medium text-white">
                {device.routerOsVersion || 'Unknown'}
              </div>
            </div>
            <div className="flex">
              <div className="w-1/3 text-sm text-slate-400">Firmware</div>
              <div className="w-2/3 text-sm font-medium text-white">
                {device.firmware || 'Unknown'}
              </div>
            </div>
            <div className="flex">
              <div className="w-1/3 text-sm text-slate-400">CPU</div>
              <div className="w-2/3 text-sm font-medium text-white">
                {device.cpu || 'Unknown'}
              </div>
            </div>
            <div className="flex">
              <div className="w-1/3 text-sm text-slate-400">Total Memory</div>
              <div className="w-2/3 text-sm font-medium text-white">
                {device.totalMemory || 'Unknown'}
              </div>
            </div>
            <div className="flex">
              <div className="w-1/3 text-sm text-slate-400">Storage</div>
              <div className="w-2/3 text-sm font-medium text-white">
                {device.storage || 'Unknown'}
              </div>
            </div>
            <div className="flex">
              <div className="w-1/3 text-sm text-slate-400">Last Updated</div>
              <div className="w-2/3 text-sm font-medium text-white">
                {formatLastSeen(device.lastSeen)}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-slate-400 text-center py-8">
            No device information available
          </div>
        )}
      </div>
    </div>
  );
};

export default DeviceInfo;
