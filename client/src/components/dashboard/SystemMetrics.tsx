import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Metric, Device } from "@shared/schema";
import GaugeChart from "./GaugeChart";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend
} from "recharts";

interface SystemMetricsProps {
  deviceId: number | null;
}

const SystemMetrics: React.FC<SystemMetricsProps> = ({ deviceId }) => {
  // Fetch device info
  const { data: device } = useQuery<Device>({ 
    queryKey: deviceId ? ['/api/devices', deviceId] : ['empty'],
    enabled: !!deviceId,
  });

  // Fetch metrics data
  const { data: metrics, isLoading } = useQuery<Metric[]>({ 
    queryKey: deviceId ? ['/api/devices', deviceId, 'metrics'] : ['empty'],
    enabled: !!deviceId,
    refetchInterval: 10000, // Refresh every 10 seconds to get latest data
  });

  // Get latest metric
  const latestMetric = metrics && metrics.length > 0 
    ? [...metrics].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0] 
    : null;

  // Prepare chart data for the system usage graph
  const formatSystemUsageChart = () => {
    if (!metrics || metrics.length === 0) return [];
    
    const last30Metrics = [...metrics]
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .slice(-30); // Last 30 data points
    
    return last30Metrics.map(metric => ({
      time: new Date(metric.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      cpu: metric.cpuUsage || 0,
      memory: metric.memoryUsage || 0,
      disk: metric.uploadBandwidth || 0, // Using uploadBandwidth as a stand-in for disk usage
    }));
  };

  const systemUsageData = formatSystemUsageChart();

  // Render loading state
  if (isLoading) {
    return (
      <div className="bg-gray-900 rounded-lg p-4 shadow-md flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Render no data state
  if (!latestMetric) {
    return (
      <div className="bg-gray-900 rounded-lg p-4 shadow-md flex items-center justify-center h-64">
        <p className="text-gray-400">No system metrics available</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="grid grid-cols-4 gap-4">
        <GaugeChart 
          title="CPU Load" 
          value={latestMetric?.cpuUsage || 0} 
          unit="%" 
        />
        <GaugeChart 
          title="CPU Temp" 
          value={latestMetric?.temperature || 0} 
          unit="°C" 
          max={100}
          colorConfig={{
            low: '#4CAF50',    // Green (good temp)
            medium: '#FFC107', // Yellow (moderate temp)
            high: '#F44336',   // Red (high temp)
          }}
        />
        <GaugeChart 
          title="Load RAM" 
          value={latestMetric?.memoryUsage || 0} 
          unit="%" 
        />
        <GaugeChart 
          title="Load system disk" 
          value={latestMetric?.uploadBandwidth ? Math.min(100, latestMetric.uploadBandwidth / 10) : 0} 
          unit="%" 
        />
      </div>

      {/* System usage line chart */}
      <div className="bg-gray-900 rounded-lg p-4 shadow-md">
        <h3 className="text-sm font-medium text-gray-200 mb-3">System</h3>
        <div className="h-[100px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={systemUsageData}
              margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
            >
              <XAxis dataKey="time" stroke="#aaa" tick={{ fontSize: 10 }} />
              <YAxis stroke="#aaa" tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ backgroundColor: '#333', border: 'none' }} />
              <Line 
                type="monotone" 
                dataKey="cpu" 
                name="Load CPU" 
                stroke="#4CAF50" 
                strokeWidth={2} 
                dot={false} 
              />
              <Line 
                type="monotone" 
                dataKey="memory" 
                name="RAM usage" 
                stroke="#FFC107" 
                strokeWidth={2} 
                dot={false} 
              />
              <Line 
                type="monotone" 
                dataKey="disk" 
                name="System disk" 
                stroke="#03A9F4" 
                strokeWidth={2} 
                dot={false} 
              />
              <Legend 
                iconSize={8} 
                iconType="circle" 
                wrapperStyle={{ fontSize: 10, color: '#ddd' }} 
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Device information table */}
      <div className="grid grid-cols-8 gap-2 text-xs bg-gray-900 rounded-lg shadow-md p-2">
        <div className="flex flex-col items-center justify-center p-2 bg-gray-800 rounded">
          <span className="text-gray-400">Uptime</span>
          <span className="text-green-400 font-medium">{device ? '5.0 days' : 'N/A'}</span>
        </div>
        <div className="col-span-2 flex flex-col items-center justify-center p-2 bg-gray-800 rounded">
          <span className="text-gray-400">Model</span>
          <span className="text-green-400 font-medium">RouterOS CRS309-1G-8S+</span>
        </div>
        <div className="col-span-2 flex flex-col items-center justify-center p-2 bg-gray-800 rounded">
          <span className="text-gray-400">RouterOS date</span>
          <span className="text-green-400 font-medium">{new Date().toLocaleDateString("en-GB")}</span>
        </div>
        <div className="flex flex-col items-center justify-center p-2 bg-gray-800 rounded">
          <span className="text-gray-400">Firmware</span>
          <span className="text-green-400 font-medium">7.16.2</span>
        </div>
        <div className="flex flex-col items-center justify-center p-2 bg-gray-800 rounded">
          <span className="text-gray-400">Board</span>
          <span className="text-green-400 font-medium">7.14.3</span>
        </div>
        <div className="flex flex-col items-center justify-center p-2 bg-gray-800 rounded">
          <span className="text-gray-400">Status</span>
          <span className="text-green-400 font-medium">Running</span>
        </div>
      </div>
    </div>
  );
};

export default SystemMetrics;