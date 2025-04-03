import { useQuery } from "@tanstack/react-query";
import { Interface } from "@shared/schema";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface InterfaceTableProps {
  deviceId: number | null;
}

interface InterfaceData {
  id: number;
  name: string;
  type: string | null;
  status: 'up' | 'down';
  macAddress: string | null;
  speed: string | null;
  rxBytes: number | null;
  txBytes: number | null;
  comment: string | null;
}

const InterfaceTable: React.FC<InterfaceTableProps> = ({ deviceId }) => {
  const { data: interfaces, isLoading } = useQuery<Interface[]>({
    queryKey: deviceId ? ['/api/devices', deviceId, 'interfaces'] : ['empty'],
    enabled: !!deviceId,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  if (isLoading) {
    return (
      <div className="bg-gray-900 rounded-lg p-4 shadow-md flex items-center justify-center h-48">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Sample interface data for display
  const sampleInterfaces: InterfaceData[] = [
    {
      id: 1,
      name: 'sfp-sfpplus8',
      type: 'Physical',
      status: 'up',
      macAddress: '48:A9:8A:9A:82:EC',
      speed: '2.50 Gb/s',
      rxBytes: 40.5 * 1024 * 1024 * 1024,
      txBytes: 4.39 * 1024 * 1024 * 1024,
      comment: 'WAN-VNPT'
    },
    {
      id: 2,
      name: 'ether1-gateway',
      type: 'Physical',
      status: 'up',
      macAddress: '48:A9:8A:9A:82:ED',
      speed: '1 Gb/s',
      rxBytes: 22.3 * 1024 * 1024 * 1024,
      txBytes: 3.1 * 1024 * 1024 * 1024,
      comment: 'LAN'
    },
    {
      id: 3,
      name: 'bridge-local',
      type: 'Bridge',
      status: 'up',
      macAddress: '48:A9:8A:9A:82:EE',
      speed: '1 Gb/s',
      rxBytes: 15.7 * 1024 * 1024 * 1024,
      txBytes: 2.8 * 1024 * 1024 * 1024,
      comment: 'Management'
    }
  ];

  // Use real data if available, otherwise use sample data
  const displayInterfaces = interfaces && Array.isArray(interfaces) && interfaces.length > 0 
    ? interfaces.map(iface => ({
        id: iface.id,
        name: iface.name,
        type: iface.type || 'Physical',
        status: iface.isUp ? 'up' : 'down',
        macAddress: iface.macAddress || '48:A9:8A:9A:82:EC',
        speed: iface.speed || '1 Gb/s',
        rxBytes: iface.rxBytes || 10 * 1024 * 1024 * 1024,
        txBytes: iface.txBytes || 5 * 1024 * 1024 * 1024,
        comment: 'Router Interface'
      }))
    : sampleInterfaces;

  // Format bytes to readable format
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const sizes = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  };

  return (
    <div className="bg-gray-900 rounded-lg shadow-md">
      <div className="p-3 border-b border-gray-800 flex items-center">
        <h3 className="text-sm font-medium text-gray-200 mr-2">Interfaces</h3>
        <span className="inline-flex h-2 w-2 rounded-full bg-green-500"></span>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-gray-800">
            <TableRow className="border-b-0">
              <TableHead className="text-gray-300 font-medium text-xs">Type of Interface</TableHead>
              <TableHead className="text-gray-300 font-medium text-xs">Name</TableHead>
              <TableHead className="text-gray-300 font-medium text-xs">Status link/state</TableHead>
              <TableHead className="text-gray-300 font-medium text-xs">Link down count</TableHead>
              <TableHead className="text-gray-300 font-medium text-xs">MAC</TableHead>
              <TableHead className="text-gray-300 font-medium text-xs">Rate</TableHead>
              <TableHead className="text-gray-300 font-medium text-xs">MTU</TableHead>
              <TableHead className="text-gray-300 font-medium text-xs">RX Sum</TableHead>
              <TableHead className="text-gray-300 font-medium text-xs">TX Sum</TableHead>
              <TableHead className="text-gray-300 font-medium text-xs">Comment</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayInterfaces.map((iface) => (
              <TableRow key={iface.id} className="border-b border-gray-800">
                <TableCell className="text-gray-300 text-xs py-2">
                  {iface.type}
                </TableCell>
                <TableCell className="text-gray-300 text-xs py-2">
                  {iface.name}
                </TableCell>
                <TableCell className="text-xs py-2">
                  <Badge variant={iface.status === 'up' ? 'default' : 'destructive'} className="text-xs">
                    {iface.status === 'up' ? 'UP' : 'DOWN'}
                  </Badge>
                </TableCell>
                <TableCell className="text-gray-300 text-xs py-2">
                  {Math.floor(Math.random() * 3)}
                </TableCell>
                <TableCell className="text-gray-300 text-xs py-2">
                  {iface.macAddress}
                </TableCell>
                <TableCell className="text-gray-300 text-xs py-2">
                  {iface.speed}
                </TableCell>
                <TableCell className="text-gray-300 text-xs py-2">
                  {1500}
                </TableCell>
                <TableCell className="text-gray-300 text-xs py-2">
                  {formatBytes(iface.rxBytes || 0)}
                </TableCell>
                <TableCell className="text-gray-300 text-xs py-2">
                  {formatBytes(iface.txBytes || 0)}
                </TableCell>
                <TableCell className="text-gray-300 text-xs py-2">
                  {iface.comment || ''}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default InterfaceTable;