import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Device, Alert, alertSeverity } from '@shared/schema';

const EventHistoryPage = () => {
  const [selectedDeviceId, setSelectedDeviceId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [timeRange, setTimeRange] = useState('all');

  const { data: devices } = useQuery<Device[]>({ 
    queryKey: ['/api/devices'],
  });

  const { data: alerts } = useQuery<Alert[]>({ 
    queryKey: ['/api/alerts'],
  });

  // Event categories for demo
  const eventCategories = {
    SYSTEM: 'System',
    SECURITY: 'Security',
    NETWORK: 'Network',
    HARDWARE: 'Hardware',
    USER: 'User Activity'
  };

  // Sample events data for demo
  const sampleEvents = [
    { 
      id: 1, 
      deviceId: 1, 
      timestamp: new Date('2025-04-02T08:23:12'), 
      category: eventCategories.SYSTEM, 
      severity: alertSeverity.INFO, 
      message: 'System startup completed', 
      details: 'RouterOS v7.3 initialized successfully'
    },
    { 
      id: 2, 
      deviceId: 1, 
      timestamp: new Date('2025-04-02T12:45:33'), 
      category: eventCategories.SECURITY, 
      severity: alertSeverity.WARNING, 
      message: 'Failed login attempt', 
      details: 'Multiple failed login attempts from IP 192.168.1.245'
    },
    { 
      id: 3, 
      deviceId: 1, 
      timestamp: new Date('2025-04-02T15:12:05'), 
      category: eventCategories.NETWORK, 
      severity: alertSeverity.ERROR, 
      message: 'Interface down', 
      details: 'Interface ether2 changed state to down'
    },
    { 
      id: 4, 
      deviceId: 1, 
      timestamp: new Date('2025-04-02T16:33:19'), 
      category: eventCategories.NETWORK, 
      severity: alertSeverity.INFO, 
      message: 'Interface up', 
      details: 'Interface ether2 changed state to up'
    },
    { 
      id: 5, 
      deviceId: 1, 
      timestamp: new Date('2025-04-03T09:05:44'), 
      category: eventCategories.HARDWARE, 
      severity: alertSeverity.WARNING, 
      message: 'High temperature', 
      details: 'System temperature reached 62°C'
    },
    { 
      id: 6, 
      deviceId: 1, 
      timestamp: new Date('2025-04-03T10:22:31'), 
      category: eventCategories.USER, 
      severity: alertSeverity.INFO, 
      message: 'Configuration changed', 
      details: 'User admin modified firewall rules'
    },
    { 
      id: 7, 
      deviceId: 2, 
      timestamp: new Date('2025-04-03T11:15:08'), 
      category: eventCategories.SYSTEM, 
      severity: alertSeverity.INFO, 
      message: 'Scheduled backup completed', 
      details: 'System configuration backup created successfully'
    }
  ];

  // Combine real alerts with sample events for demonstration
  const getEventData = () => {
    let events = [...sampleEvents];
    
    if (alerts && alerts.length > 0) {
      const alertEvents = alerts.map(alert => {
        // Normalize the severity to match expected values
        let normalizedSeverity = alertSeverity.INFO; // Default
        if (alert.severity === alertSeverity.WARNING || alert.severity === alertSeverity.ERROR) {
          normalizedSeverity = alert.severity;
        }
        
        return {
          id: 1000 + alert.id, // Avoid ID collision with sample data
          deviceId: alert.deviceId,
          timestamp: new Date(alert.timestamp),
          category: eventCategories.SYSTEM,
          severity: normalizedSeverity,
          message: alert.message,
          details: alert.source || ""
        };
      });
      
      events = [...alertEvents, ...events];
    }
    
    // Filter by device if one is selected
    if (selectedDeviceId) {
      events = events.filter(event => event.deviceId === selectedDeviceId);
    }
    
    // Filter by search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      events = events.filter(event => 
        event.message.toLowerCase().includes(term) || 
        event.details.toLowerCase().includes(term) ||
        event.category.toLowerCase().includes(term)
      );
    }
    
    // Filter by time range
    if (timeRange !== 'all') {
      const now = new Date();
      let cutoff = new Date();
      
      switch (timeRange) {
        case '24h':
          cutoff.setDate(now.getDate() - 1);
          break;
        case '7d':
          cutoff.setDate(now.getDate() - 7);
          break;
        case '30d':
          cutoff.setDate(now.getDate() - 30);
          break;
      }
      
      events = events.filter(event => event.timestamp >= cutoff);
    }
    
    // Sort by timestamp (newest first)
    return events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  };

  const events = getEventData();

  const getDeviceById = (id: number | null) => {
    if (!id || !devices) return null;
    return devices.find(device => device.id === id) || null;
  };

  const selectedDevice = getDeviceById(selectedDeviceId);

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case alertSeverity.ERROR:
        return <Badge variant="destructive">Error</Badge>;
      case alertSeverity.WARNING:
        return <Badge variant="default">Warning</Badge>;
      case alertSeverity.INFO:
      default:
        return <Badge variant="secondary">Info</Badge>;
    }
  };

  const formatDateTime = (date: Date) => {
    return date.toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const exportEvents = () => {
    // Triển khai chức năng xuất sự kiện (CSV, JSON,...)
    alert('Chức năng xuất sự kiện sẽ được triển khai trong bản cập nhật tiếp theo');
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Event History</h1>
        
        <div className="flex items-center space-x-2">
          <Button onClick={exportEvents} variant="outline">Export Events</Button>
          
          <span className="text-sm text-gray-500">Device:</span>
          <select 
            className="p-2 border border-gray-300 rounded-md bg-white focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            value={selectedDeviceId || ""}
            onChange={(e) => setSelectedDeviceId(e.target.value ? parseInt(e.target.value) : null)}
          >
            <option value="">All Devices</option>
            {devices?.map(device => (
              <option key={device.id} value={device.id}>
                {device.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle>Event Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex flex-col space-y-1.5 flex-1">
              <label htmlFor="search" className="text-sm font-medium">Search Events</label>
              <Input
                id="search"
                placeholder="Search by message, details or category..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            
            <div className="flex flex-col space-y-1.5">
              <label htmlFor="timeRange" className="text-sm font-medium">Time Range</label>
              <select 
                id="timeRange"
                className="p-2 border border-gray-300 rounded-md bg-white focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value)}
              >
                <option value="all">All Time</option>
                <option value="24h">Last 24 Hours</option>
                <option value="7d">Last 7 Days</option>
                <option value="30d">Last 30 Days</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="all" className="space-y-4">
        <TabsList>
          <TabsTrigger value="all">All Events</TabsTrigger>
          <TabsTrigger value="system">System</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="network">Network</TabsTrigger>
          <TabsTrigger value="hardware">Hardware</TabsTrigger>
        </TabsList>
        
        {['all', 'system', 'security', 'network', 'hardware'].map(category => (
          <TabsContent key={category} value={category} className="space-y-4">
            <Card>
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[180px]">Time</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead>Message</TableHead>
                      <TableHead className="hidden md:table-cell">Details</TableHead>
                      {!selectedDeviceId && <TableHead>Device</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {events
                      .filter(event => category === 'all' || event.category.toLowerCase() === category)
                      .map(event => (
                        <TableRow key={event.id}>
                          <TableCell className="font-mono text-xs">
                            {formatDateTime(event.timestamp)}
                          </TableCell>
                          <TableCell>{event.category}</TableCell>
                          <TableCell>
                            {getSeverityBadge(event.severity)}
                          </TableCell>
                          <TableCell className="font-medium">{event.message}</TableCell>
                          <TableCell className="hidden md:table-cell text-sm text-gray-500">
                            {event.details}
                          </TableCell>
                          {!selectedDeviceId && (
                            <TableCell>
                              {getDeviceById(event.deviceId)?.name || `Device ${event.deviceId}`}
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    
                    {events.filter(event => category === 'all' || event.category.toLowerCase() === category).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={selectedDeviceId ? 5 : 6} className="text-center py-8 text-gray-500">
                          No events found for the selected filters
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};

export default EventHistoryPage;