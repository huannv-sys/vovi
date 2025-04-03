import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Device } from "@shared/schema";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

const DevicesPage = () => {
  const { toast } = useToast();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    ipAddress: "",
    username: "",
    password: "",
  });
  
  const { data: devices, isLoading } = useQuery<Device[]>({ 
    queryKey: ['/api/devices'],
  });
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      await apiRequest('POST', '/api/devices', formData);
      queryClient.invalidateQueries({ queryKey: ['/api/devices'] });
      setIsAddDialogOpen(false);
      setFormData({
        name: "",
        ipAddress: "",
        username: "",
        password: "",
      });
      toast({
        title: "Device Added",
        description: "The device has been added successfully.",
      });
    } catch (error) {
      console.error('Failed to add device:', error);
      toast({
        title: "Error",
        description: "Failed to add the device. Please try again.",
        variant: "destructive",
      });
    }
  };
  
  const handleRefreshDevice = async (deviceId: number) => {
    try {
      await apiRequest('POST', `/api/devices/${deviceId}/refresh`, {});
      queryClient.invalidateQueries({ queryKey: ['/api/devices'] });
      toast({
        title: "Device Refreshed",
        description: "Device data has been refreshed successfully.",
      });
    } catch (error) {
      console.error('Failed to refresh device:', error);
      toast({
        title: "Error",
        description: "Failed to refresh the device. Please try again.",
        variant: "destructive",
      });
    }
  };
  
  const handleDeleteDevice = async (deviceId: number) => {
    if (!confirm("Are you sure you want to delete this device?")) {
      return;
    }
    
    try {
      await apiRequest('DELETE', `/api/devices/${deviceId}`, {});
      queryClient.invalidateQueries({ queryKey: ['/api/devices'] });
      toast({
        title: "Device Deleted",
        description: "The device has been deleted successfully.",
      });
    } catch (error) {
      console.error('Failed to delete device:', error);
      toast({
        title: "Error",
        description: "Failed to delete the device. Please try again.",
        variant: "destructive",
      });
    }
  };
  
  const formatLastSeen = (date: string | Date | null | undefined) => {
    if (!date) return 'Never';
    
    const lastSeen = new Date(date);
    return lastSeen.toLocaleString();
  };
  
  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Devices</h1>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              Add Device
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Device</DialogTitle>
              <DialogDescription>
                Enter the details of the Mikrotik device you want to monitor.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleFormSubmit}>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Device Name</Label>
                  <Input
                    id="name"
                    name="name"
                    placeholder="Office Router"
                    value={formData.name}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="ipAddress">IP Address</Label>
                  <Input
                    id="ipAddress"
                    name="ipAddress"
                    placeholder="192.168.1.1"
                    value={formData.ipAddress}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    name="username"
                    placeholder="admin"
                    value={formData.username}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    value={formData.password}
                    onChange={handleInputChange}
                    required
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit">Add Device</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      
      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      ) : devices && devices.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {devices.map((device) => (
            <Card key={device.id}>
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <CardTitle className="text-lg">{device.name}</CardTitle>
                  <div className={`px-2 py-1 text-xs font-medium rounded-full ${device.isOnline ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {device.isOnline ? 'Online' : 'Offline'}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pb-2">
                <div className="space-y-2">
                  <div className="flex items-center text-sm">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
                      <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
                      <line x1="6" y1="6" x2="6" y2="6"></line>
                      <line x1="6" y1="18" x2="6" y2="18"></line>
                    </svg>
                    <span className="text-gray-700">{device.ipAddress}</span>
                  </div>
                  <div className="flex items-center text-sm">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                      <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                    <span className="text-gray-700">{device.username}</span>
                  </div>
                  <div className="flex items-center text-sm">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect>
                      <rect x="9" y="9" width="6" height="6"></rect>
                      <line x1="9" y1="1" x2="9" y2="4"></line>
                      <line x1="15" y1="1" x2="15" y2="4"></line>
                      <line x1="9" y1="20" x2="9" y2="23"></line>
                      <line x1="15" y1="20" x2="15" y2="23"></line>
                      <line x1="20" y1="9" x2="23" y2="9"></line>
                      <line x1="20" y1="14" x2="23" y2="14"></line>
                      <line x1="1" y1="9" x2="4" y2="9"></line>
                      <line x1="1" y1="14" x2="4" y2="14"></line>
                    </svg>
                    <span className="text-gray-700">{device.model || 'Unknown model'}</span>
                  </div>
                  <div className="flex items-center text-sm">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"></circle>
                      <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                    <span className="text-gray-700">Last seen: {formatLastSeen(device.lastSeen)}</span>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button variant="outline" onClick={() => handleRefreshDevice(device.id)}>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
                  </svg>
                  Refresh
                </Button>
                <Button variant="destructive" onClick={() => handleDeleteDevice(device.id)}>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    <line x1="10" y1="11" x2="10" y2="17"></line>
                    <line x1="14" y1="11" x2="14" y2="17"></line>
                  </svg>
                  Delete
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-gray-400 mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="6" width="20" height="12" rx="2" />
              <line x1="2" y1="12" x2="22" y2="12" />
            </svg>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No devices found</h3>
            <p className="text-sm text-gray-500 mb-4 text-center">
              Add your first Mikrotik device to start monitoring.
            </p>
            <Button onClick={() => setIsAddDialogOpen(true)}>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              Add Device
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default DevicesPage;
