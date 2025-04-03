import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Device } from "@shared/schema";

import SummaryCards from "@/components/dashboard/SummaryCards";
import CPUMemoryChart from "@/components/dashboard/CPUMemoryChart";
import NetworkTrafficChart from "@/components/dashboard/NetworkTrafficChart";
import InterfaceStatus from "@/components/dashboard/InterfaceStatus";
import DeviceInfo from "@/components/dashboard/DeviceInfo";
import ActiveAlerts from "@/components/dashboard/ActiveAlerts";

const Dashboard = () => {
  const [selectedDeviceId, setSelectedDeviceId] = useState<number | null>(null);
  
  const { data: devices } = useQuery<Device[]>({ 
    queryKey: ['/api/devices'],
  });
  
  // Set selected device to the first device if none is selected
  useEffect(() => {
    if (devices && devices.length > 0 && !selectedDeviceId) {
      setSelectedDeviceId(devices[0].id);
    }
  }, [devices, selectedDeviceId]);
  
  return (
    <div>
      {/* Summary Cards */}
      <SummaryCards deviceId={selectedDeviceId} />
      
      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <CPUMemoryChart deviceId={selectedDeviceId} />
        <NetworkTrafficChart deviceId={selectedDeviceId} />
      </div>
      
      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <InterfaceStatus deviceId={selectedDeviceId} />
        <DeviceInfo deviceId={selectedDeviceId} />
        <ActiveAlerts deviceId={selectedDeviceId} />
      </div>
    </div>
  );
};

export default Dashboard;
