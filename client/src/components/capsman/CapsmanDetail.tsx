import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Wifi,
  WifiOff,
  Radio,
  Server,
  Clock,
  Info,
  Users,
  Settings
} from "lucide-react";

interface CapsmanDetailProps {
  deviceId: number | null;
  apId?: number | null;
}

export default function CapsmanDetail({ deviceId, apId }: CapsmanDetailProps) {
  const [activeTab, setActiveTab] = useState("info");

  const { data: capsmanAPs, isLoading: isLoadingAPs, error: apsError } = useQuery({
    queryKey: deviceId ? [`/api/devices/${deviceId}/capsman`] : [],
    enabled: !!deviceId
  });

  // Lấy thông tin chi tiết về một CAPsMAN AP cụ thể nếu có apId
  const { data: apDetail, isLoading: isLoadingDetail, error: detailError } = useQuery({
    queryKey: apId ? [`/api/capsman/${apId}`] : [],
    enabled: !!apId
  });

  // Truy vấn thông tin thiết bị để kiểm tra xem có hỗ trợ CAPsMAN không
  const { data: device } = useQuery<any>({
    queryKey: deviceId ? [`/api/devices/${deviceId}`] : [],
    enabled: !!deviceId
  });

  if (!deviceId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Chi tiết CAPsMAN AP</CardTitle>
          <CardDescription>Vui lòng chọn thiết bị để xem chi tiết</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (isLoadingAPs || isLoadingDetail) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Chi tiết CAPsMAN AP</CardTitle>
          <CardDescription>Đang tải thông tin chi tiết...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (apsError || detailError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Chi tiết CAPsMAN AP</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertTitle>Lỗi</AlertTitle>
            <AlertDescription>
              Không thể tải thông tin chi tiết. Vui lòng thử lại sau.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  // Kiểm tra xem thiết bị có hỗ trợ CAPsMAN không
  if (device && (device.hasCAPsMAN === false || !device.hasCAPsMAN)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Chi tiết CAPsMAN AP</CardTitle>
          <CardDescription>Thiết bị không hỗ trợ CAPsMAN</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center p-6 text-muted-foreground">
            <Radio className="h-10 w-10 mr-2" />
            <p>Thiết bị này không có chức năng CAPsMAN controller</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!capsmanAPs || !Array.isArray(capsmanAPs) || capsmanAPs.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Chi tiết CAPsMAN AP</CardTitle>
          <CardDescription>Không có Access Point kết nối</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center p-6 text-muted-foreground">
            <WifiOff className="h-10 w-10 mr-2" />
            <p>Không có thiết bị AP nào được quản lý bởi CAPsMAN</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Sử dụng AP đầu tiên nếu không có apId
  const selectedAP = apDetail || (apId && Array.isArray(capsmanAPs) 
    ? capsmanAPs.find((ap: any) => ap.id === apId) 
    : (Array.isArray(capsmanAPs) && capsmanAPs.length > 0 ? capsmanAPs[0] : null));

  if (!selectedAP) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Chi tiết CAPsMAN AP</CardTitle>
          <CardDescription>Không tìm thấy thông tin Access Point</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>{selectedAP.identity || selectedAP.name}</CardTitle>
            <CardDescription>
              {selectedAP.state === 'running' ? 
                <span className="flex items-center text-green-500">
                  <Wifi className="h-4 w-4 mr-1" /> Đang hoạt động
                </span> : 
                <span className="flex items-center text-red-500">
                  <WifiOff className="h-4 w-4 mr-1" /> {selectedAP.state || 'Ngừng hoạt động'}
                </span>
              }
            </CardDescription>
          </div>
          <div className="text-right">
            <CardTitle>Model: {selectedAP.model || 'N/A'}</CardTitle>
            <CardDescription>
              Uptime: {selectedAP.uptime || 'N/A'}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="info">
              <Info className="h-4 w-4 mr-2" /> Thông tin
            </TabsTrigger>
            <TabsTrigger value="clients">
              <Users className="h-4 w-4 mr-2" /> Clients
            </TabsTrigger>
            <TabsTrigger value="system">
              <Server className="h-4 w-4 mr-2" /> Hệ thống
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="info" className="pt-4">
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-y-2">
                <div className="text-sm font-medium">Tên thiết bị:</div>
                <div>{selectedAP.identity || selectedAP.name}</div>
                
                <div className="text-sm font-medium">Địa chỉ IP:</div>
                <div>{selectedAP.ipAddress || 'N/A'}</div>
                
                <div className="text-sm font-medium">MAC Address:</div>
                <div>{selectedAP.macAddress || 'N/A'}</div>
                
                <div className="text-sm font-medium">Radio MAC:</div>
                <div>{selectedAP.radioMac || 'N/A'}</div>
                
                <div className="text-sm font-medium">Radio Name:</div>
                <div>{selectedAP.radioName || 'N/A'}</div>
                
                <div className="text-sm font-medium">Trạng thái:</div>
                <div>{selectedAP.state === 'running' ? 'Hoạt động' : selectedAP.state || 'Ngừng hoạt động'}</div>
                
                <div className="text-sm font-medium">Uptime:</div>
                <div>{selectedAP.uptime || 'N/A'}</div>
                
                <div className="text-sm font-medium">Cập nhật cuối:</div>
                <div>{formatDate(selectedAP.lastSeen)}</div>
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="clients" className="pt-4">
            <div className="space-y-4">
              <div className="flex justify-between items-center bg-muted p-4 rounded-lg">
                <div className="flex items-center">
                  <Users className="h-10 w-10 mr-3 text-primary" />
                  <div>
                    <h3 className="text-lg font-semibold">Clients kết nối</h3>
                    <p className="text-sm text-muted-foreground">Số lượng thiết bị</p>
                  </div>
                </div>
                <div className="text-3xl font-bold">{selectedAP.clients || 0}</div>
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="system" className="pt-4">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-muted p-4 rounded-lg">
                  <h3 className="text-sm font-medium">Model</h3>
                  <p className="text-lg font-semibold">{selectedAP.model || 'N/A'}</p>
                </div>
                <div className="bg-muted p-4 rounded-lg">
                  <h3 className="text-sm font-medium">Version</h3>
                  <p className="text-lg font-semibold">{selectedAP.version || 'N/A'}</p>
                </div>
                <div className="bg-muted p-4 rounded-lg">
                  <h3 className="text-sm font-medium">Serial Number</h3>
                  <p className="text-lg font-semibold">{selectedAP.serialNumber || 'N/A'}</p>
                </div>
                <div className="bg-muted p-4 rounded-lg">
                  <h3 className="text-sm font-medium">Uptime</h3>
                  <p className="text-lg font-semibold flex items-center">
                    <Clock className="h-4 w-4 mr-1" /> {selectedAP.uptime || 'N/A'}
                  </p>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function formatDate(dateString: string | null) {
  if (!dateString) return 'N/A';
  
  try {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('vi-VN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(date);
  } catch (error) {
    return dateString;
  }
}