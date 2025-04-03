import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Device } from "@shared/schema";

import SummaryCards from "@/components/dashboard/SummaryCards";
import CPUMemoryChart from "@/components/dashboard/CPUMemoryChart";
import NetworkTrafficChart from "@/components/dashboard/NetworkTrafficChart";
import NetworkTrafficAdvanced from "@/components/dashboard/NetworkTrafficAdvanced";
import InterfaceStatus from "@/components/dashboard/InterfaceStatus";
import InterfaceTable from "@/components/dashboard/InterfaceTable";
import DeviceInfo from "@/components/dashboard/DeviceInfo";
import ActiveAlerts from "@/components/dashboard/ActiveAlerts";
import SystemMetrics from "@/components/dashboard/SystemMetrics";

const Dashboard = () => {
  const [selectedDeviceId, setSelectedDeviceId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'basic' | 'advanced'>('basic');
  
  // Close the view mode selector when clicked outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.view-mode-switcher')) {
        // If click is outside the view mode switcher, don't change anything
        // (keeping this comment for future expandability)
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);
  
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
    <div className="space-y-6">
      {/* View Mode Switcher */}
      <div className="flex justify-end mb-2">
        <div className="view-mode-switcher inline-flex items-center rounded-md bg-gray-900 p-1">
          <button
            onClick={() => setViewMode('basic')}
            className={`px-3 py-1 text-sm rounded-md ${viewMode === 'basic' ? 'bg-gray-700 text-white' : 'text-gray-300'}`}
          >
            Basic View
          </button>
          <button
            onClick={() => setViewMode('advanced')}
            className={`px-3 py-1 text-sm rounded-md ${viewMode === 'advanced' ? 'bg-gray-700 text-white' : 'text-gray-300'}`}
          >
            Advanced View
          </button>
        </div>
      </div>

      {viewMode === 'basic' ? (
        /* Basic View */
        <>
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
        </>
      ) : (
        /* Advanced View (New Dashboard) */
        <>
          {/* System Metrics (Gauges and Line Chart) */}
          <SystemMetrics deviceId={selectedDeviceId} />
          
          {/* Network Traffic Advanced Chart */}
          <NetworkTrafficAdvanced deviceId={selectedDeviceId} />
          
          {/* Interfaces Table */}
          <InterfaceTable deviceId={selectedDeviceId} />
          
          {/* Alerts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ActiveAlerts deviceId={selectedDeviceId} />
            <DeviceInfo deviceId={selectedDeviceId} />
          </div>
        </>
      )}
    </div>
  );
};

export default Dashboard;
