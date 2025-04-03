import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Device, Metric } from '@shared/schema';
import {
  Bar,
  BarChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend
} from 'recharts';

const PerformanceReportsPage = () => {
  const [selectedDeviceId, setSelectedDeviceId] = useState<number | null>(null);
  const [reportType, setReportType] = useState('daily');
  const [timeRange, setTimeRange] = useState('1W');

  const { data: devices } = useQuery<Device[]>({ 
    queryKey: ['/api/devices'],
  });

  const { data: metrics } = useQuery<Metric[]>({ 
    queryKey: selectedDeviceId ? [`/api/devices/${selectedDeviceId}/metrics`] : ['empty-metrics'],
    enabled: !!selectedDeviceId,
  });

  // Thêm báo cáo mẫu cho demo - trong thực tế, dữ liệu này sẽ được lấy từ API
  const sampleData = [
    { date: '01/04', cpuLoad: 45, memoryUsage: 62, temperature: 42, bandwidth: 240 },
    { date: '02/04', cpuLoad: 52, memoryUsage: 58, temperature: 44, bandwidth: 310 },
    { date: '03/04', cpuLoad: 48, memoryUsage: 65, temperature: 46, bandwidth: 290 },
    { date: '04/04', cpuLoad: 70, memoryUsage: 72, temperature: 48, bandwidth: 350 },
    { date: '05/04', cpuLoad: 65, memoryUsage: 80, temperature: 50, bandwidth: 410 },
    { date: '06/04', cpuLoad: 58, memoryUsage: 75, temperature: 45, bandwidth: 380 },
    { date: '07/04', cpuLoad: 63, memoryUsage: 70, temperature: 43, bandwidth: 320 },
  ];

  // Sử dụng metrics từ API nếu có, nếu không thì sử dụng dữ liệu mẫu
  const getChartData = () => {
    if (metrics && metrics.length > 0) {
      // Xử lý dữ liệu từ API
      const formattedData = metrics.map(metric => ({
        date: new Date(metric.timestamp).toLocaleDateString('en-GB', { 
          day: '2-digit', 
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        }),
        cpuLoad: metric.cpuUsage || 0,
        memoryUsage: metric.memoryUsage || 0,
        temperature: metric.temperature || 0,
        bandwidth: ((metric.uploadBandwidth || 0) + (metric.downloadBandwidth || 0)) / 1024 / 1024, // Convert to MB
      }));
      
      return formattedData;
    }
    
    return sampleData;
  };

  const chartData = getChartData();

  const getDeviceById = (id: number | null) => {
    if (!id || !devices) return null;
    return devices.find(device => device.id === id) || null;
  };

  const selectedDevice = getDeviceById(selectedDeviceId);

  const exportReport = () => {
    // Triển khai chức năng xuất báo cáo (PDF, CSV,...)
    alert('Chức năng xuất báo cáo sẽ được triển khai trong bản cập nhật tiếp theo');
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Performance Reports</h1>
        
        <div className="flex items-center space-x-2">
          <span className="text-sm text-gray-500">Device:</span>
          <select 
            className="p-2 border border-gray-300 rounded-md bg-white focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            value={selectedDeviceId || ""}
            onChange={(e) => setSelectedDeviceId(e.target.value ? parseInt(e.target.value) : null)}
            disabled={!devices?.length}
          >
            {!devices?.length ? (
              <option>No devices available</option>
            ) : (
              devices.map(device => (
                <option key={device.id} value={device.id}>
                  {device.name}
                </option>
              ))
            )}
          </select>
        </div>
      </div>

      <Card className="mb-6">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle>Report Configuration</CardTitle>
            <Button onClick={exportReport}>Export Report</Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="flex flex-col space-y-1.5">
              <label htmlFor="reportType" className="text-sm font-medium">Report Type</label>
              <Select value={reportType} onValueChange={setReportType}>
                <SelectTrigger id="reportType" className="w-[180px]">
                  <SelectValue placeholder="Select Report Type" />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value="daily">Daily Report</SelectItem>
                  <SelectItem value="weekly">Weekly Report</SelectItem>
                  <SelectItem value="monthly">Monthly Report</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex flex-col space-y-1.5">
              <label htmlFor="timeRange" className="text-sm font-medium">Time Range</label>
              <Select value={timeRange} onValueChange={setTimeRange}>
                <SelectTrigger id="timeRange" className="w-[180px]">
                  <SelectValue placeholder="Select Time Range" />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value="1D">Last 24 Hours</SelectItem>
                  <SelectItem value="1W">Last Week</SelectItem>
                  <SelectItem value="1M">Last Month</SelectItem>
                  <SelectItem value="3M">Last 3 Months</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="cpu" className="space-y-4">
        <TabsList>
          <TabsTrigger value="cpu">CPU Usage</TabsTrigger>
          <TabsTrigger value="memory">Memory Usage</TabsTrigger>
          <TabsTrigger value="temperature">Temperature</TabsTrigger>
          <TabsTrigger value="bandwidth">Bandwidth</TabsTrigger>
        </TabsList>
        
        <TabsContent value="cpu" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>CPU Load History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <XAxis dataKey="date" />
                    <YAxis />
                    <CartesianGrid strokeDasharray="3 3" />
                    <Tooltip />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="cpuLoad" 
                      stroke="#8884d8" 
                      activeDot={{ r: 8 }} 
                      name="CPU Load (%)"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="memory" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Memory Usage History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <XAxis dataKey="date" />
                    <YAxis />
                    <CartesianGrid strokeDasharray="3 3" />
                    <Tooltip />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="memoryUsage" 
                      stroke="#82ca9d" 
                      activeDot={{ r: 8 }} 
                      name="Memory Usage (%)"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="temperature" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Temperature History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <XAxis dataKey="date" />
                    <YAxis />
                    <CartesianGrid strokeDasharray="3 3" />
                    <Tooltip />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="temperature" 
                      stroke="#ff7300" 
                      activeDot={{ r: 8 }} 
                      name="Temperature (°C)"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="bandwidth" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Bandwidth Usage History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <XAxis dataKey="date" />
                    <YAxis />
                    <CartesianGrid strokeDasharray="3 3" />
                    <Tooltip />
                    <Legend />
                    <Bar 
                      dataKey="bandwidth" 
                      fill="#8884d8" 
                      name="Bandwidth (MB)"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default PerformanceReportsPage;