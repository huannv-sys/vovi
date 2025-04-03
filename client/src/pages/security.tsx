import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Device } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const SecurityPage = () => {
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

  // Mock security data for demonstration
  const firewallRules = [
    { id: 1, name: "Allow HTTP", chain: "forward", action: "accept", protocol: "tcp", dstPort: "80", state: "enabled" },
    { id: 2, name: "Allow HTTPS", chain: "forward", action: "accept", protocol: "tcp", dstPort: "443", state: "enabled" },
    { id: 3, name: "Block Telnet", chain: "forward", action: "drop", protocol: "tcp", dstPort: "23", state: "enabled" },
    { id: 4, name: "Allow SSH", chain: "forward", action: "accept", protocol: "tcp", dstPort: "22", state: "disabled" },
    { id: 5, name: "Block Malicious IPs", chain: "forward", action: "drop", protocol: "any", dstPort: "any", state: "enabled" }
  ];

  const securityThreats = [
    { id: 1, type: "bruteforce", source: "192.168.5.123", target: "SSH", count: 15, lastAttempt: "2025-04-03T08:45:21Z", severity: "high" },
    { id: 2, type: "portscan", source: "192.168.100.53", target: "Multiple ports", count: 132, lastAttempt: "2025-04-03T10:12:09Z", severity: "medium" },
    { id: 3, type: "malware", source: "Unknown", target: "Internal network", count: 3, lastAttempt: "2025-04-02T22:35:47Z", severity: "critical" }
  ];

  const vpnUsers = [
    { id: 1, username: "john.doe", status: "active", ipAddress: "10.8.0.2", connectedSince: "2025-04-03T09:30:00Z", bytesReceived: 15482913, bytesSent: 2854102 },
    { id: 2, username: "sarah.smith", status: "active", ipAddress: "10.8.0.3", connectedSince: "2025-04-03T11:15:22Z", bytesReceived: 8245903, bytesSent: 1254831 },
    { id: 3, username: "admin", status: "inactive", ipAddress: "10.8.0.4", connectedSince: "2025-04-02T14:20:15Z", bytesReceived: 0, bytesSent: 0 }
  ];

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getDeviceById = (id: number | null) => {
    if (!id || !devices) return null;
    return devices.find(device => device.id === id) || null;
  };

  const selectedDevice = getDeviceById(selectedDeviceId);

  const getSeverityBadge = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'critical':
        return <Badge variant="destructive">Critical</Badge>;
      case 'high':
        return <Badge className="bg-red-500">High</Badge>;
      case 'medium':
        return <Badge className="bg-amber-500">Medium</Badge>;
      case 'low':
        return <Badge className="bg-blue-500">Low</Badge>;
      default:
        return <Badge>Unknown</Badge>;
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Security Monitoring</h1>
        
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

      <Tabs defaultValue="threats" className="space-y-4">
        <TabsList>
          <TabsTrigger value="threats">Security Threats</TabsTrigger>
          <TabsTrigger value="firewall">Firewall Rules</TabsTrigger>
          <TabsTrigger value="vpn">VPN Status</TabsTrigger>
        </TabsList>
        
        <TabsContent value="threats" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Detected Security Threats</CardTitle>
            </CardHeader>
            <CardContent>
              {securityThreats.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Target</TableHead>
                      <TableHead>Count</TableHead>
                      <TableHead>Last Attempt</TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {securityThreats.map((threat) => (
                      <TableRow key={threat.id}>
                        <TableCell className="font-medium">{threat.type}</TableCell>
                        <TableCell>{threat.source}</TableCell>
                        <TableCell>{threat.target}</TableCell>
                        <TableCell>{threat.count}</TableCell>
                        <TableCell>{formatDateTime(threat.lastAttempt)}</TableCell>
                        <TableCell>{getSeverityBadge(threat.severity)}</TableCell>
                        <TableCell>
                          <Button variant="outline" size="sm">Block</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="flex flex-col items-center justify-center py-12">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-gray-400 mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    <path d="M12 8v4" />
                    <path d="M12 16h.01" />
                  </svg>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Security Threats Detected</h3>
                  <p className="text-sm text-gray-500 text-center">
                    No current security threats have been detected for this device.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="firewall" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Firewall Rules</CardTitle>
              <Button>Add Rule</Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Chain</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Protocol</TableHead>
                    <TableHead>Dst. Port</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {firewallRules.map((rule) => (
                    <TableRow key={rule.id}>
                      <TableCell className="font-medium">{rule.name}</TableCell>
                      <TableCell>{rule.chain}</TableCell>
                      <TableCell>
                        <Badge variant={rule.action === "accept" ? "outline" : "destructive"}>
                          {rule.action}
                        </Badge>
                      </TableCell>
                      <TableCell>{rule.protocol}</TableCell>
                      <TableCell>{rule.dstPort}</TableCell>
                      <TableCell>
                        <Badge variant={rule.state === "enabled" ? "default" : "secondary"}>
                          {rule.state}
                        </Badge>
                      </TableCell>
                      <TableCell className="flex space-x-2">
                        <Button variant="outline" size="sm">Edit</Button>
                        <Button variant="destructive" size="sm">Delete</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="vpn" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>VPN Connections</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Username</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>IP Address</TableHead>
                    <TableHead>Connected Since</TableHead>
                    <TableHead>Data Received</TableHead>
                    <TableHead>Data Sent</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vpnUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.username}</TableCell>
                      <TableCell>
                        <Badge variant={user.status === "active" ? "success" : "secondary"}>
                          {user.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{user.ipAddress}</TableCell>
                      <TableCell>{user.status === "active" ? formatDateTime(user.connectedSince) : "—"}</TableCell>
                      <TableCell>{formatBytes(user.bytesReceived)}</TableCell>
                      <TableCell>{formatBytes(user.bytesSent)}</TableCell>
                      <TableCell>
                        {user.status === "active" && (
                          <Button variant="destructive" size="sm">Disconnect</Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SecurityPage;