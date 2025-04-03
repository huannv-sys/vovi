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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface NetworkTrafficAdvancedProps {
  deviceId: number | null;
}

// Định dạng bytes sang các đơn vị đọc được
const formatBytes = (bytes: number, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

// Định dạng Mbps 
const formatMbps = (mbps: number) => {
  return mbps.toFixed(2) + ' Mbps';
};

const NetworkTrafficAdvanced: React.FC<NetworkTrafficAdvancedProps> = ({ deviceId }) => {
  const [activeTab, setActiveTab] = useState<string>("graph");
  
  // Fetch metrics data
  const { data: metrics, isLoading } = useQuery<Metric[]>({ 
    queryKey: deviceId ? ['/api/devices', deviceId, 'metrics'] : ['empty'],
    enabled: !!deviceId,
    refetchInterval: 3000, // Refresh every 3 seconds for near real-time updates
  });

  // Format traffic data for the chart
  const formatTrafficData = () => {
    if (!metrics || !Array.isArray(metrics) || metrics.length === 0) {
      return [];
    }
    
    // Sort metrics by timestamp and take last 50 records
    const sortedMetrics = [...metrics]
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .slice(-50);
    
    return sortedMetrics.map(metric => {
      // Convert bytes to Mb/s for display - ensure we have valid values
      const download = metric.downloadBandwidth ? (metric.downloadBandwidth / 1024 / 1024 * 8) : 0;
      const upload = metric.uploadBandwidth ? (metric.uploadBandwidth / 1024 / 1024 * 8) : 0;
      
      return {
        time: new Date(metric.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        download,
        upload,
        // Real traffic data for advanced view
        traffic: download + upload,
        downloadRate: download,
        uploadRate: upload,
        timestamp: metric.timestamp
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

  // Lấy dữ liệu hiện tại để hiển thị trong bảng tóm tắt
  const getCurrentTrafficStats = () => {
    if (!trafficData || trafficData.length === 0) {
      return {
        timestamp: new Date().toISOString(),
        download: 0,
        upload: 0,
        traffic: 0,
      };
    }

    // Lấy mục cuối cùng trong dữ liệu
    const latestData = trafficData[trafficData.length - 1];
    return {
      timestamp: latestData.timestamp,
      download: latestData.download,
      upload: latestData.upload,
      traffic: latestData.traffic,
    };
  };

  // Tính toán tổng băng thông đã sử dụng (ước tính) dựa trên dữ liệu
  const calculateTotalBandwidthUsed = () => {
    if (!trafficData || trafficData.length < 2) return { download: 0, upload: 0, total: 0 };
    
    // Tính khoảng thời gian trung bình giữa các điểm (giây)
    let timeSum = 0;
    let intervals = 0;
    
    for (let i = 1; i < trafficData.length; i++) {
      if (!trafficData[i-1].timestamp || !trafficData[i].timestamp) continue;
      
      const prevTime = new Date(trafficData[i-1].timestamp).getTime();
      const currTime = new Date(trafficData[i].timestamp).getTime();
      const diffSeconds = (currTime - prevTime) / 1000;
      
      if (diffSeconds > 0 && diffSeconds < 300) { // Loại bỏ các khoảng thời gian bất thường (>5 phút)
        timeSum += diffSeconds;
        intervals++;
      }
    }
    
    const avgInterval = intervals > 0 ? timeSum / intervals : 3; // Mặc định 3 giây nếu không tính được
    
    // Tính tổng băng thông đã sử dụng (MB)
    let totalDownload = 0;
    let totalUpload = 0;
    
    for (const data of trafficData) {
      if (typeof data.download === 'number' && typeof data.upload === 'number') {
        // Chuyển đổi từ Mbps sang MB/s (chia 8), sau đó nhân với khoảng thời gian
        totalDownload += (data.download / 8) * avgInterval / 1024; // GB
        totalUpload += (data.upload / 8) * avgInterval / 1024; // GB
      }
    }
    
    return { 
      download: totalDownload, 
      upload: totalUpload,
      total: totalDownload + totalUpload
    };
  };

  const currentStats = getCurrentTrafficStats();
  const totalBandwidth = calculateTotalBandwidthUsed();
  
  if (isLoading) {
    return (
      <div className="bg-gray-900 rounded-lg p-4 shadow-md flex items-center justify-center h-[600px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }
  
  // Render the appropriate content based on the active tab
  const renderContent = () => {
    if (activeTab === "graph") {
      return (
        <>
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
        </>
      );
    } else {
      return (
        <div className="p-3">
          <div className="grid grid-cols-1 gap-4">
            {/* Current Traffic Card */}
            <Card className="border-none bg-slate-950">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm font-medium">Current Traffic</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-slate-900 rounded-md p-3">
                    <div className="text-xs text-gray-400 mb-1">Download</div>
                    <div className="text-green-400 font-mono font-medium text-lg">
                      {formatMbps(currentStats.download)}
                    </div>
                  </div>
                  <div className="bg-slate-900 rounded-md p-3">
                    <div className="text-xs text-gray-400 mb-1">Upload</div>
                    <div className="text-orange-400 font-mono font-medium text-lg">
                      {formatMbps(currentStats.upload)}
                    </div>
                  </div>
                  <div className="bg-slate-900 rounded-md p-3">
                    <div className="text-xs text-gray-400 mb-1">Total</div>
                    <div className="text-blue-400 font-mono font-medium text-lg">
                      {formatMbps(currentStats.traffic)}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Traffic Statistics */}
            <Card className="border-none bg-slate-950">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm font-medium">Session Statistics</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-slate-900 rounded-md p-3">
                    <div className="text-xs text-gray-400 mb-1">Downloaded</div>
                    <div className="text-green-400 font-mono font-medium">
                      {totalBandwidth.download.toFixed(2)} GB
                    </div>
                  </div>
                  <div className="bg-slate-900 rounded-md p-3">
                    <div className="text-xs text-gray-400 mb-1">Uploaded</div>
                    <div className="text-orange-400 font-mono font-medium">
                      {totalBandwidth.upload.toFixed(2)} GB
                    </div>
                  </div>
                  <div className="bg-slate-900 rounded-md p-3">
                    <div className="text-xs text-gray-400 mb-1">Total</div>
                    <div className="text-blue-400 font-mono font-medium">
                      {(totalBandwidth.total || 0).toFixed(2)} GB
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Performance Analysis */}
            <Card className="border-none bg-slate-950">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm font-medium">Network Performance</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between bg-slate-900 rounded-md p-3">
                    <div className="text-sm">Bandwidth Utilization</div>
                    <Badge 
                      variant={currentStats.traffic > 15 ? "destructive" : currentStats.traffic > 10 ? "default" : "secondary"}
                    >
                      {currentStats.traffic > 15 ? "High" : currentStats.traffic > 10 ? "Medium" : "Low"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between bg-slate-900 rounded-md p-3">
                    <div className="text-sm">Download/Upload Ratio</div>
                    <div className="text-sm font-mono">
                      {currentStats.upload > 0 
                        ? (currentStats.download / currentStats.upload).toFixed(1) 
                        : "N/A"}
                    </div>
                  </div>
                  <div className="flex items-center justify-between bg-slate-900 rounded-md p-3">
                    <div className="text-sm">Network Quality</div>
                    <Badge 
                      variant={
                        currentStats.traffic < 5 
                          ? "destructive" 
                          : currentStats.traffic < 10 
                          ? "default" 
                          : "secondary"
                      }
                    >
                      {currentStats.traffic < 5 
                        ? "Poor" 
                        : currentStats.traffic < 10 
                        ? "Good" 
                        : "Excellent"}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      );
    }
  };

  return (
    <div className="bg-gray-900 rounded-lg shadow-md">
      <div className="p-3 border-b border-gray-800 flex justify-between items-center">
        <h3 className="text-sm font-medium text-gray-200">Network Traffic Advanced</h3>
        <div className="inline-flex h-8 items-center justify-center rounded-md bg-gray-800 p-1 text-gray-400">
          <button
            className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 h-7 text-xs ${
              activeTab === "graph" 
              ? "bg-gray-700 text-gray-200" 
              : "hover:bg-gray-700/50 hover:text-gray-300"
            }`}
            onClick={() => setActiveTab("graph")}
          >
            Graph
          </button>
          <button
            className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 h-7 text-xs ${
              activeTab === "details"
              ? "bg-gray-700 text-gray-200"
              : "hover:bg-gray-700/50 hover:text-gray-300"
            }`}
            onClick={() => setActiveTab("details")}
          >
            Details
          </button>
        </div>
      </div>

      {renderContent()}
    </div>
  );
};

export default NetworkTrafficAdvanced;