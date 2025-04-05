import React, { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { Card, Alert, Badge, Button, Spinner } from '../components/ui/bootstrap';
import WebSocketContext, { useWebSocketContext } from '../lib/websocket-context';

interface NetworkDevice {
  id: number;
  ipAddress: string;
  macAddress: string;
  hostName?: string;
  interface?: string;
  deviceType?: string;
  vendor?: string;
  firstSeen?: string;
  lastSeen?: string;
  isOnline?: boolean;
  deviceData?: any;
  txBytes?: number;
  rxBytes?: number;
  txRate?: number;
  rxRate?: number;
}

interface AlertMessage {
  type: 'success' | 'danger' | 'warning' | 'info';
  message: string;
}

const ClientsPage: React.FC = () => {
  const [clients, setClients] = useState<NetworkDevice[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [scanning, setScanning] = useState<boolean>(false);
  const [refreshingAll, setRefreshingAll] = useState<boolean>(false);
  const [subnet, setSubnet] = useState<string>('');
  const [alert, setAlert] = useState<AlertMessage | null>(null);
  const [selectedClient, setSelectedClient] = useState<NetworkDevice | null>(null);
  const [deviceDetails, setDeviceDetails] = useState<any | null>(null);
  const [detailsLoading, setDetailsLoading] = useState<boolean>(false);
  
  // Sử dụng useContext trực tiếp để tránh lỗi
  const websocketContext = useContext(WebSocketContext);
  
  if (!websocketContext) {
    console.error('WebSocketContext not available');
    return <div className="container p-5 text-center">
      <h2>Không thể kết nối đến WebSocket</h2>
      <p>Vui lòng thử tải lại trang</p>
    </div>;
  }
  
  const { subscribe, unsubscribe } = websocketContext;

  // Fetch clients on component mount
  useEffect(() => {
    fetchClients();

    // Subscribe to WebSocket events for real-time updates
    subscribe('network-devices-update', (data) => {
      if (data && Array.isArray(data)) {
        setClients(prev => {
          // Update existing clients with new data
          const updated = [...prev];
          data.forEach(newDevice => {
            const index = updated.findIndex(d => d.id === newDevice.id);
            if (index >= 0) {
              updated[index] = { ...updated[index], ...newDevice };
            } else {
              updated.push(newDevice);
            }
          });
          return updated;
        });
      } else if (data && typeof data === 'object') {
        // Single device update
        updateClientInList(data);
      }
    });

    // Cleanup function
    return () => {
      unsubscribe('network-devices-update');
    };
  }, []);

  const fetchClients = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/network-devices');
      setClients(response.data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching network clients:', error);
      setAlert({
        type: 'danger',
        message: 'Failed to fetch network clients. Please try again later.'
      });
      setLoading(false);
    }
  };

  const scanNetwork = async () => {
    try {
      setScanning(true);
      setAlert(null);
      const response = await axios.post('/api/network-scan', { subnet: subnet || undefined });
      setClients(prev => {
        // Merge new devices with existing ones
        const existingIds = new Set(prev.map(d => d.id));
        const newDevices = response.data.filter((d: NetworkDevice) => !existingIds.has(d.id));
        return [...prev, ...newDevices];
      });
      setAlert({
        type: 'success',
        message: `Network scan completed. Found ${response.data.length} devices.`
      });
      setScanning(false);
    } catch (error) {
      console.error('Error scanning network:', error);
      setAlert({
        type: 'danger',
        message: 'Failed to scan network. Please try again later.'
      });
      setScanning(false);
    }
  };

  const refreshAllClients = async () => {
    try {
      setRefreshingAll(true);
      const response = await axios.post('/api/clients/refresh-all');
      setClients(response.data);
      setAlert({
        type: 'success',
        message: 'All clients refreshed successfully.'
      });
      setRefreshingAll(false);
    } catch (error) {
      console.error('Error refreshing clients:', error);
      setAlert({
        type: 'danger',
        message: 'Failed to refresh clients. Please try again later.'
      });
      setRefreshingAll(false);
    }
  };

  const refreshClient = async (clientId: number) => {
    try {
      const response = await axios.post(`/api/clients/${clientId}/refresh`);
      updateClientInList(response.data);
      setAlert({
        type: 'success',
        message: 'Client refreshed successfully.'
      });
      
      // If we're viewing details of this client, update them too
      if (selectedClient && selectedClient.id === clientId) {
        setDeviceDetails(response.data);
      }
    } catch (error) {
      console.error('Error refreshing client:', error);
      setAlert({
        type: 'danger',
        message: 'Failed to refresh client. Please try again later.'
      });
    }
  };

  const updateClientInList = (updatedClient: NetworkDevice) => {
    setClients(prev => {
      const updated = [...prev];
      const index = updated.findIndex(c => c.id === updatedClient.id);
      if (index >= 0) {
        updated[index] = { ...updated[index], ...updatedClient };
      } else {
        updated.push(updatedClient);
      }
      return updated;
    });
  };

  const identifyDevice = async (clientId: number) => {
    try {
      setAlert(null);
      const response = await axios.post(`/api/network-devices/${clientId}/identify`);
      updateClientInList(response.data);
      setAlert({
        type: 'success',
        message: 'Device identified successfully.'
      });
      
      // If we're viewing details of this client, update them too
      if (selectedClient && selectedClient.id === clientId) {
        setDeviceDetails(response.data);
      }
    } catch (error) {
      console.error('Error identifying device:', error);
      setAlert({
        type: 'danger',
        message: 'Failed to identify device. Please try again later.'
      });
    }
  };

  const collectTrafficData = async (clientId: number) => {
    try {
      setAlert(null);
      const response = await axios.post(`/api/network-devices/${clientId}/collect-traffic`);
      updateClientInList(response.data);
      setAlert({
        type: 'success',
        message: 'Traffic data collected successfully.'
      });
      
      // If we're viewing details of this client, update them too
      if (selectedClient && selectedClient.id === clientId) {
        setDeviceDetails(response.data);
      }
    } catch (error) {
      console.error('Error collecting traffic data:', error);
      setAlert({
        type: 'danger',
        message: 'Failed to collect traffic data. Please try again later.'
      });
    }
  };

  const viewClientDetails = (client: NetworkDevice) => {
    setSelectedClient(client);
    setDeviceDetails(null);
    setDetailsLoading(true);
    
    axios.get(`/api/network-devices/${client.id}`)
      .then(response => {
        setDeviceDetails(response.data);
        setDetailsLoading(false);
      })
      .catch(error => {
        console.error('Error fetching client details:', error);
        setAlert({
          type: 'danger',
          message: 'Failed to fetch client details. Please try again later.'
        });
        setDetailsLoading(false);
      });
  };

  const closeDetails = () => {
    setSelectedClient(null);
    setDeviceDetails(null);
  };

  const formatBytes = (bytes?: number, decimals = 2) => {
    if (!bytes || bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const formatBps = (bps?: number, decimals = 2) => {
    if (!bps || bps === 0) return '0 bps';
    
    const k = 1000;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['bps', 'Kbps', 'Mbps', 'Gbps', 'Tbps'];
    
    const i = Math.floor(Math.log(bps) / Math.log(k));
    
    return parseFloat((bps / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const getStatusBadge = (client: NetworkDevice) => {
    if (client.isOnline) {
      return <Badge variant="success">Online</Badge>;
    } else {
      return <Badge variant="danger">Offline</Badge>;
    }
  };

  const getDeviceTypeBadge = (client: NetworkDevice) => {
    const type = client.deviceType || 'Unknown';
    let variant: "success" | "danger" | "warning" | "info" | "secondary" | "primary" | "dark" | "light" = 'secondary';
    
    switch (type.toLowerCase()) {
      case 'router':
        variant = 'primary';
        break;
      case 'switch':
        variant = 'info';
        break;
      case 'access point':
      case 'accesspoint':
      case 'wireless':
        variant = 'success';
        break;
      case 'server':
        variant = 'dark';
        break;
      case 'phone':
      case 'mobile':
        variant = 'warning';
        break;
      case 'camera':
      case 'iot':
        variant = 'danger';
        break;
      default:
        variant = 'secondary';
    }
    
    return <Badge variant={variant}>{type}</Badge>;
  };

  const renderClientCard = (client: NetworkDevice) => {
    return (
      <Card key={client.id} className="mb-3">
        <Card.Body>
          <div className="d-flex justify-content-between align-items-center mb-2">
            <h5 className="mb-0">
              {client.hostName || client.ipAddress}
            </h5>
            <div>
              {getStatusBadge(client)}
              {' '}
              {getDeviceTypeBadge(client)}
            </div>
          </div>
          
          <div className="mb-3">
            <div><strong>IP:</strong> {client.ipAddress}</div>
            <div><strong>MAC:</strong> {client.macAddress}</div>
            {client.vendor && <div><strong>Vendor:</strong> {client.vendor}</div>}
            {client.interface && <div><strong>Interface:</strong> {client.interface}</div>}
          </div>
          
          {(client.txBytes !== undefined || client.rxBytes !== undefined) && (
            <div className="mb-3">
              {client.txBytes !== undefined && <div><strong>TX:</strong> {formatBytes(client.txBytes)}</div>}
              {client.rxBytes !== undefined && <div><strong>RX:</strong> {formatBytes(client.rxBytes)}</div>}
              {client.txRate !== undefined && <div><strong>TX Rate:</strong> {formatBps(client.txRate)}</div>}
              {client.rxRate !== undefined && <div><strong>RX Rate:</strong> {formatBps(client.rxRate)}</div>}
            </div>
          )}
          
          <div className="d-flex justify-content-between">
            <Button 
              variant="primary" 
              size="sm" 
              onClick={() => viewClientDetails(client)}
            >
              View Details
            </Button>
            <div>
              <Button 
                variant="outline-secondary" 
                size="sm" 
                className="me-2"
                onClick={() => refreshClient(client.id)}
              >
                Refresh
              </Button>
              <Button 
                variant="outline-info" 
                size="sm" 
                className="me-2"
                onClick={() => identifyDevice(client.id)}
              >
                Identify
              </Button>
              <Button 
                variant="outline-primary" 
                size="sm"
                onClick={() => collectTrafficData(client.id)}
              >
                Traffic
              </Button>
            </div>
          </div>
        </Card.Body>
      </Card>
    );
  };

  const renderClientDetails = () => {
    if (!selectedClient) return null;
    
    return (
      <div className="client-details-panel">
        <Card>
          <Card.Header className="d-flex justify-content-between align-items-center">
            <h5 className="mb-0">Client Details</h5>
            <Button variant="outline-secondary" size="sm" onClick={closeDetails}>Close</Button>
          </Card.Header>
          
          <Card.Body>
            {detailsLoading ? (
              <div className="text-center p-4">
                <Spinner animation="border" />
                <p className="mt-2">Loading client details...</p>
              </div>
            ) : deviceDetails ? (
              <div>
                <div className="mb-4">
                  <h4>{deviceDetails.hostName || deviceDetails.ipAddress}</h4>
                  <div className="mb-2">
                    {getStatusBadge(deviceDetails)}
                    {' '}
                    {getDeviceTypeBadge(deviceDetails)}
                  </div>
                </div>
                
                <div className="mb-4">
                  <h5>Network Information</h5>
                  <div className="mb-3">
                    <div><strong>IP Address:</strong> {deviceDetails.ipAddress}</div>
                    <div><strong>MAC Address:</strong> {deviceDetails.macAddress}</div>
                    {deviceDetails.vendor && <div><strong>Vendor:</strong> {deviceDetails.vendor}</div>}
                    {deviceDetails.interface && <div><strong>Interface:</strong> {deviceDetails.interface}</div>}
                  </div>
                </div>
                
                {deviceDetails.deviceData && (
                  <div className="mb-4">
                    <h5>Device Information</h5>
                    <pre className="bg-light p-3 rounded">
                      {JSON.stringify(deviceDetails.deviceData, null, 2)}
                    </pre>
                  </div>
                )}
                
                <div className="mb-4">
                  <h5>Traffic Statistics</h5>
                  {deviceDetails.txBytes !== undefined && <div><strong>TX:</strong> {formatBytes(deviceDetails.txBytes)}</div>}
                  {deviceDetails.rxBytes !== undefined && <div><strong>RX:</strong> {formatBytes(deviceDetails.rxBytes)}</div>}
                  {deviceDetails.txRate !== undefined && <div><strong>TX Rate:</strong> {formatBps(deviceDetails.txRate)}</div>}
                  {deviceDetails.rxRate !== undefined && <div><strong>RX Rate:</strong> {formatBps(deviceDetails.rxRate)}</div>}
                </div>
                
                <div className="mb-4">
                  <h5>Timeline</h5>
                  <div><strong>First Seen:</strong> {new Date(deviceDetails.firstSeen).toLocaleString()}</div>
                  <div><strong>Last Seen:</strong> {new Date(deviceDetails.lastSeen).toLocaleString()}</div>
                </div>
                
                <div className="d-flex justify-content-between mt-4">
                  <Button 
                    variant="outline-primary" 
                    onClick={() => refreshClient(deviceDetails.id)}
                  >
                    Refresh
                  </Button>
                  <Button 
                    variant="outline-info" 
                    onClick={() => identifyDevice(deviceDetails.id)}
                  >
                    Identify Device
                  </Button>
                  <Button 
                    variant="outline-primary" 
                    onClick={() => collectTrafficData(deviceDetails.id)}
                  >
                    Collect Traffic
                  </Button>
                </div>
              </div>
            ) : (
              <p>No details available for this client.</p>
            )}
          </Card.Body>
        </Card>
      </div>
    );
  };

  return (
    <div className="container-fluid p-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1>Network Clients</h1>
        <div>
          <Button 
            variant="outline-secondary" 
            className="me-2"
            onClick={fetchClients}
            disabled={loading}
          >
            {loading ? <><Spinner animation="border" size="sm" /> Loading...</> : 'Refresh'}
          </Button>
          <Button 
            variant="outline-primary"
            onClick={refreshAllClients}
            disabled={refreshingAll}
          >
            {refreshingAll ? <><Spinner animation="border" size="sm" /> Updating...</> : 'Update All Status'}
          </Button>
        </div>
      </div>
      
      {alert && (
        <Alert 
          variant={alert.type} 
          dismissible 
          onClose={() => setAlert(null)}
          className="mb-4"
        >
          {alert.message}
        </Alert>
      )}
      
      <div className="mb-4">
        <Card>
          <Card.Body>
            <Card.Title>Network Scanner</Card.Title>
            <div className="row g-3 align-items-center">
              <div className="col-md-6">
                <label htmlFor="subnet" className="form-label">Subnet (optional)</label>
                <input 
                  type="text" 
                  className="form-control" 
                  id="subnet" 
                  placeholder="e.g. 192.168.1.0/24" 
                  value={subnet}
                  onChange={(e) => setSubnet(e.target.value)}
                />
                <div className="form-text">Leave empty to scan your local network</div>
              </div>
              <div className="col-md-6 d-flex align-items-end">
                <Button 
                  variant="primary" 
                  onClick={scanNetwork}
                  disabled={scanning}
                  className="w-100"
                >
                  {scanning ? (
                    <>
                      <Spinner animation="border" size="sm" /> 
                      Scanning Network...
                    </>
                  ) : (
                    'Scan Network'
                  )}
                </Button>
              </div>
            </div>
          </Card.Body>
        </Card>
      </div>
      
      <div className="row">
        <div className={selectedClient ? "col-md-8" : "col-md-12"}>
          {loading ? (
            <div className="text-center p-5">
              <Spinner animation="border" />
              <p className="mt-3">Loading network clients...</p>
            </div>
          ) : clients.length > 0 ? (
            <div>
              <p className="text-muted mb-3">Showing {clients.length} network clients</p>
              {clients.map(client => renderClientCard(client))}
            </div>
          ) : (
            <div className="text-center p-5 bg-light rounded">
              <p className="mb-3">No network clients found.</p>
              <Button variant="primary" onClick={scanNetwork}>Scan Network</Button>
            </div>
          )}
        </div>
        
        {selectedClient && (
          <div className="col-md-4">
            {renderClientDetails()}
          </div>
        )}
      </div>
    </div>
  );
};

export default ClientsPage;