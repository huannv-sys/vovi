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
    queryKey: [`/api/devices/${deviceId ?? 0}/interfaces`, { includeHealth: true }],
    enabled: !!deviceId,
  });
  
  // Get the color class based on health score
  const getHealthScoreColorClass = (score: number | null | undefined): string => {
    if (score === null || score === undefined) return 'text-gray-400';
    if (score >= 90) return 'text-green-500';
    if (score >= 70) return 'text-blue-500';
    if (score >= 50) return 'text-yellow-500';
    if (score >= 20) return 'text-orange-500';
    return 'text-red-500';
  };
  
  // Get the health status text based on score
  const getHealthStatusText = (score: number | null | undefined): string => {
    if (score === null || score === undefined) return 'Unknown';
    if (score >= 90) return 'Excellent';
    if (score >= 70) return 'Good';
    if (score >= 50) return 'Fair';
    if (score >= 20) return 'Poor';
    return 'Critical';
  };
  
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
          interfaces.map((iface: Interface) => (
            <div key={iface.id} className="mb-3 last:mb-0">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center">
                  <div className={`w-2 h-2 rounded-full ${iface.isUp ? 'bg-green-500' : 'bg-red-500'} mr-2`}></div>
                  <span className="font-medium text-sm text-neutral-dark">
                    {iface.name || 'Unknown Interface'}
                  </span>
                </div>
                <div className="flex items-center">
                  <span className={`text-xs font-medium mr-2 ${getHealthScoreColorClass(iface.healthScore)}`}>
                    {getHealthStatusText(iface.healthScore)}
                  </span>
                  <span className="text-xs text-gray-500">
                    {iface.isUp ? iface.speed : 'Disconnected'}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-gray-500">
                <div>
                  <span className="mr-3">TX: {iface.txBytes != null ? formatBytes(iface.txBytes) : '0 B'}</span>
                  <span>RX: {iface.rxBytes != null ? formatBytes(iface.rxBytes) : '0 B'}</span>
                </div>
                {iface.healthScore != null && (
                  <span className={`px-2 py-0.5 rounded-full text-white text-xs ${getHealthScoreColorClass(iface.healthScore).replace('text-', 'bg-')}`}>
                    {iface.healthScore}
                  </span>
                )}
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
