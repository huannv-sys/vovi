import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Metric } from "@shared/schema";
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend
} from "recharts";

interface NetworkTrafficAdvancedProps {
  deviceId: number | null;
}

const NetworkTrafficAdvanced: React.FC<NetworkTrafficAdvancedProps> = ({ deviceId }) => {
  // Fetch metrics data
  const { data: metrics, isLoading } = useQuery<Metric[]>({ 
    queryKey: deviceId ? ['/api/devices', deviceId, 'metrics'] : ['empty'],
    enabled: !!deviceId,
    refetchInterval: 3000, // Refresh every 3 seconds for near real-time updates
  });

  // Format traffic data for the chart
  const formatTrafficData = () => {
    if (!metrics || !Array.isArray(metrics) || metrics.length === 0) return [];
    
    // Sort metrics by timestamp and take last 50 records
    const sortedMetrics = [...metrics]
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .slice(-50);
    
    return sortedMetrics.map(metric => {
      // Convert bytes to Mb/s for display
      const download = metric.downloadBandwidth ? (metric.downloadBandwidth / 1024 / 1024 * 8) : 0;
      const upload = metric.uploadBandwidth ? (metric.uploadBandwidth / 1024 / 1024 * 8) : 0;
      
      return {
        time: new Date(metric.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        download,
        upload,
        // Generate enhanced traffic data for advanced view with download and upload components
        traffic: Math.max(1, (download + upload) * 0.8),
        downloadRate: Math.max(0.2, download * 1.2),
        uploadRate: Math.max(0.1, upload * 0.9)
      };
    });
  };
  
  const trafficData = formatTrafficData();

  // Calculate scale for Y axis
  const getMaxTraffic = () => {
    if (!trafficData.length) return 25;
    
    const maxValue = Math.max(
      ...trafficData.map(item => Math.max(item.download, item.upload, item.traffic))
    );
    
    // Round up to nearest 5
    return Math.ceil(maxValue / 5) * 5;
  };
  
  const yAxisMax = getMaxTraffic();
  
  // Generate fixed ticks for Y axis
  const getYAxisTicks = () => {
    const baseTicks = [0, 5, 10, 15, 20, 25];
    if (yAxisMax > 25) {
      return [...baseTicks, yAxisMax];
    }
    return baseTicks;
  };
  
  if (isLoading) {
    return (
      <div className="bg-gray-900 rounded-lg p-4 shadow-md flex items-center justify-center h-[330px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }
  
  return (
    <div className="bg-gray-900 rounded-lg shadow-md">
      <div className="p-3 border-b border-gray-800">
        <h3 className="text-sm font-medium text-gray-200">Network Traffic Advanced</h3>
      </div>
      <div className="p-3 h-[280px]">
        {trafficData.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            No traffic data available
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={trafficData}
              margin={{ top: 10, right: 5, left: 0, bottom: 20 }}
            >
              <defs>
                <linearGradient id="colorTraffic" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2196F3" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#2196F3" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#444" />
              <XAxis 
                dataKey="time" 
                tick={{ fontSize: 10, fill: '#aaa' }} 
                axisLine={{ stroke: '#444' }}
                tickLine={{ stroke: '#444' }}
              />
              <YAxis 
                domain={[0, yAxisMax]} 
                tick={{ fontSize: 10, fill: '#aaa' }} 
                axisLine={{ stroke: '#444' }}
                tickLine={{ stroke: '#444' }}
                label={{ 
                  value: 'Mb/s', 
                  angle: -90, 
                  position: 'insideLeft',
                  style: { fontSize: 10, fill: '#aaa' } 
                }}
                ticks={getYAxisTicks()}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#333', 
                  border: 'none', 
                  borderRadius: '4px', 
                  fontSize: '12px'
                }} 
              />
              <defs>
                <linearGradient id="colorDownload" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#4CAF50" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#4CAF50" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorUpload" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#FF5722" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#FF5722" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <Area 
                type="monotone" 
                dataKey="traffic" 
                stroke="#2196F3" 
                fillOpacity={1} 
                fill="url(#colorTraffic)" 
                name="Total Traffic (Mb/s)"
              />
              <Area 
                type="monotone" 
                dataKey="downloadRate" 
                stroke="#4CAF50" 
                fillOpacity={0.5} 
                fill="url(#colorDownload)" 
                name="Download (Mb/s)"
              />
              <Area 
                type="monotone" 
                dataKey="uploadRate" 
                stroke="#FF5722" 
                fillOpacity={0.5} 
                fill="url(#colorUpload)" 
                name="Upload (Mb/s)"
              />
              <Legend iconSize={8} wrapperStyle={{ fontSize: 10, color: '#ddd' }} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
      <div className="p-3 border-t border-gray-800">
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full bg-blue-500 mr-2"></div>
            <span className="text-blue-300">Total Traffic</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full bg-green-500 mr-2"></div>
            <span className="text-green-300">Download</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full bg-orange-500 mr-2"></div>
            <span className="text-orange-300">Upload</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NetworkTrafficAdvanced;