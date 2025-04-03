import { useQuery } from "@tanstack/react-query";
import { Alert, alertSeverity } from "@shared/schema";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

interface ActiveAlertsProps {
  deviceId: number | null;
}

const ActiveAlerts: React.FC<ActiveAlertsProps> = ({ deviceId }) => {
  const { data: alerts, isLoading } = useQuery<Alert[]>({ 
    queryKey: ['/api/alerts', { deviceId, acknowledged: false, limit: 3 }],
    enabled: !!deviceId,
  });
  
  const formatAlertTime = (timestamp: string | Date) => {
    const alertTime = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - alertTime.getTime();
    
    const diffMins = Math.floor(diffMs / (1000 * 60));
    if (diffMins < 60) {
      return `${diffMins} min ago`;
    }
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) {
      return `${diffHours}h ago`;
    }
    
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };
  
  const getAlertColor = (severity: string) => {
    switch (severity) {
      case alertSeverity.ERROR:
        return 'bg-red-50 border-red-100 text-red-500';
      case alertSeverity.WARNING:
        return 'bg-yellow-50 border-yellow-100 text-amber-500';
      case alertSeverity.INFO:
      default:
        return 'bg-blue-50 border-blue-100 text-blue-500';
    }
  };
  
  const acknowledgeAllAlerts = async () => {
    try {
      await apiRequest('POST', `/api/alerts/acknowledge-all?deviceId=${deviceId}`, {});
      queryClient.invalidateQueries({ queryKey: ['/api/alerts'] });
    } catch (error) {
      console.error('Failed to acknowledge alerts:', error);
    }
  };
  
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <h3 className="font-medium text-neutral-dark">Active Alerts</h3>
        <Link href="/alerts">
          <a className="text-xs text-primary hover:text-primary-dark">View All</a>
        </Link>
      </div>
      <div className="p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-24">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          </div>
        ) : alerts && alerts.length > 0 ? (
          <>
            {alerts.map((alert) => (
              <div 
                key={alert.id} 
                className={`mb-4 last:mb-0 p-3 rounded-md ${getAlertColor(alert.severity)}`}
              >
                <div className="flex items-center mb-1">
                  <div className="mr-2">
                    {alert.severity === alertSeverity.ERROR ? (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                      </svg>
                    ) : alert.severity === alertSeverity.WARNING ? (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                        <line x1="12" y1="9" x2="12" y2="13"></line>
                        <line x1="12" y1="17" x2="12.01" y2="17"></line>
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="16" x2="12" y2="12"></line>
                        <line x1="12" y1="8" x2="12.01" y2="8"></line>
                      </svg>
                    )}
                  </div>
                  <span className="font-medium text-sm">
                    {alert.message}
                  </span>
                  <span className="ml-auto text-xs text-gray-500">
                    {formatAlertTime(alert.timestamp)}
                  </span>
                </div>
                <p className="text-sm text-gray-600">{alert.source}</p>
              </div>
            ))}
            
            <div className="mt-4 pt-4 border-t border-gray-200">
              <Button
                variant="outline"
                className="w-full"
                onClick={acknowledgeAllAlerts}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 11l3 3L22 4"></path>
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                </svg>
                Acknowledge All
              </Button>
            </div>
          </>
        ) : (
          <div className="text-sm text-center py-8 text-gray-500">
            No active alerts
          </div>
        )}
      </div>
    </div>
  );
};

export default ActiveAlerts;
