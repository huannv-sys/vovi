import { useQuery } from "@tanstack/react-query";
import { Interface } from "@shared/schema";

interface InterfaceStatusProps {
  deviceId: number | null;
}

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const InterfaceStatus: React.FC<InterfaceStatusProps> = ({ deviceId }) => {
  const { data: interfaces, isLoading } = useQuery<Interface[]>({ 
    queryKey: deviceId ? [`/api/devices/${deviceId}/interfaces`] : null,
    enabled: !!deviceId,
  });
  
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="px-4 py-3 border-b border-gray-200">
        <h3 className="font-medium text-neutral-dark">Interface Status</h3>
      </div>
      <div className="p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-24">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          </div>
        ) : interfaces && interfaces.length > 0 ? (
          interfaces.map((iface) => (
            <div key={iface.id} className="mb-3 last:mb-0">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center">
                  <div className={`w-2 h-2 rounded-full ${iface.isUp ? 'bg-green-500' : 'bg-red-500'} mr-2`}></div>
                  <span className="font-medium text-sm text-neutral-dark">{iface.name}</span>
                </div>
                <span className="text-xs text-gray-500">
                  {iface.isUp ? iface.speed : 'Disconnected'}
                </span>
              </div>
              <div className="flex items-center text-xs text-gray-500">
                <span className="mr-3">TX: {formatBytes(iface.txBytes)}</span>
                <span>RX: {formatBytes(iface.rxBytes)}</span>
              </div>
            </div>
          ))
        ) : (
          <div className="text-sm text-gray-500 text-center py-8">
            No interfaces available
          </div>
        )}
      </div>
    </div>
  );
};

export default InterfaceStatus;
