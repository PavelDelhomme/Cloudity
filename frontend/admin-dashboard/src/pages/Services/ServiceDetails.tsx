import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  ArrowLeft, 
  Play, 
  Square, 
  RotateCcw, 
  Activity, 
  Globe, 
  Clock, 
  HardDrive,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  XCircle
} from 'lucide-react';
import { adminService } from '@/services/admin.service';
import { toast } from 'sonner';

interface ServiceDetails {
  name: string;
  status: 'running' | 'stopped' | 'unknown';
  container: string;
  url: string;
  port: string;
  type: string;
  description: string;
  category: string;
  uptime?: string;
  image?: string;
  started_at?: string;
}

interface ServiceLogs {
  service: string;
  logs: string;
  lines: number;
}

const ServiceDetails: React.FC = () => {
  const { serviceName } = useParams<{ serviceName: string }>();
  const navigate = useNavigate();
  const [service, setService] = useState<ServiceDetails | null>(null);
  const [logs, setLogs] = useState<ServiceLogs | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'stopped':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'bg-green-100 text-green-800';
      case 'stopped':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-yellow-100 text-yellow-800';
    }
  };

  const fetchServiceDetails = async () => {
    try {
      setLoading(true);
      const response = await adminService.getServicesStatus();
      const serviceData = response.data.services.find((s: any) => s.name === serviceName);
      
      if (serviceData) {
        setService(serviceData);
        setError(null);
      } else {
        setError(`Service "${serviceName}" non trouvé`);
      }
    } catch (err) {
      setError('Erreur lors du chargement des détails du service');
      console.error('Error fetching service details:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchLogs = async () => {
    if (!serviceName) return;
    
    try {
      const response = await adminService.getServiceLogs(serviceName, 100);
      setLogs(response.data);
    } catch (err) {
      console.error('Error fetching logs:', err);
      toast.error('Erreur lors du chargement des logs');
    }
  };

  const handleServiceAction = async (action: 'start' | 'stop' | 'restart') => {
    if (!serviceName) return;
    
    try {
      setActionLoading(action);
      const response = await adminService.controlService(serviceName, action);
      
      if (response.data.success) {
        toast.success(`Service ${serviceName} ${action}é avec succès`);
        // Rafraîchir les détails du service
        setTimeout(() => {
          fetchServiceDetails();
        }, 2000);
      } else {
        toast.error(response.data.message || `Erreur lors du ${action} du service`);
      }
    } catch (err: any) {
      console.error(`Error ${action}ing service:`, err);
      toast.error(`Erreur lors du ${action} du service: ${err.response?.data?.message || err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  useEffect(() => {
    if (serviceName) {
      fetchServiceDetails();
      fetchLogs();
    }
  }, [serviceName]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin" />
        <span className="ml-2">Chargement des détails du service...</span>
      </div>
    );
  }

  if (error || !service) {
    return (
      <div className="space-y-4">
        <Button
          variant="outline"
          onClick={() => navigate('/services')}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Retour aux services
        </Button>
        
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error || 'Service non trouvé'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button
            variant="outline"
            onClick={() => navigate('/services')}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Retour
          </Button>
          
          <div>
            <h1 className="text-2xl font-bold">{service.description}</h1>
            <p className="text-muted-foreground">{service.name}</p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {getStatusIcon(service.status)}
          <Badge className={getStatusColor(service.status)}>
            {service.status}
          </Badge>
        </div>
      </div>

      {/* Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Activity className="h-5 w-5 mr-2" />
            Actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex space-x-2">
            <Button
              onClick={() => handleServiceAction('start')}
              disabled={actionLoading !== null || service.status === 'running'}
              variant="outline"
            >
              {actionLoading === 'start' ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Démarrer
            </Button>
            
            <Button
              onClick={() => handleServiceAction('stop')}
              disabled={actionLoading !== null || service.status === 'stopped'}
              variant="outline"
            >
              {actionLoading === 'stop' ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Square className="h-4 w-4 mr-2" />
              )}
              Arrêter
            </Button>
            
            <Button
              onClick={() => handleServiceAction('restart')}
              disabled={actionLoading !== null}
              variant="outline"
            >
              {actionLoading === 'restart' ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4 mr-2" />
              )}
              Redémarrer
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Details and Logs */}
      <Tabs defaultValue="details" className="space-y-4">
        <TabsList>
          <TabsTrigger value="details">Détails</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Service Info */}
            <Card>
              <CardHeader>
                <CardTitle>Informations du service</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Nom</label>
                    <p className="text-sm">{service.name}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Type</label>
                    <p className="text-sm">{service.type}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Catégorie</label>
                    <p className="text-sm">{service.category}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Port</label>
                    <p className="text-sm">{service.port}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Conteneur</label>
                    <p className="text-sm">{service.container}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Image</label>
                    <p className="text-sm">{service.image || 'N/A'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Network Info */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Globe className="h-5 w-5 mr-2" />
                  Réseau
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">URL</label>
                  <div className="flex items-center space-x-2">
                    <p className="text-sm font-mono">{service.url}</p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => window.open(service.url, '_blank')}
                    >
                      <Globe className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                
                {service.uptime && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Uptime</label>
                    <p className="text-sm">{service.uptime}</p>
                  </div>
                )}
                
                {service.started_at && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Démarré le</label>
                    <p className="text-sm">{new Date(service.started_at).toLocaleString()}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="logs" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center">
                  <Clock className="h-5 w-5 mr-2" />
                  Logs du service
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchLogs}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Actualiser
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {logs ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>Dernières {logs.lines} lignes</span>
                    <span>{logs.service}</span>
                  </div>
                  <pre className="bg-muted p-4 rounded-lg text-sm overflow-auto max-h-96 whitespace-pre-wrap">
                    {logs.logs || 'Aucun log disponible'}
                  </pre>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="h-8 w-8 mx-auto mb-2" />
                  <p>Chargement des logs...</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ServiceDetails;
