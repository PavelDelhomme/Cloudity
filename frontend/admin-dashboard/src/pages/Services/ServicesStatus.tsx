import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Server, 
  Play, 
  Square, 
  RotateCcw,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Activity,
  Eye
} from 'lucide-react';
import { adminService } from '@/services/admin.service';
import { toast } from 'sonner';

interface Service {
  name: string;
  status: 'running' | 'stopped' | 'unknown';
  container: string;
  url: string;
  port: string;
  type: string;
  description: string;
  category: string;
}

interface ServicesResponse {
  services: Service[];
  total: number;
  running: number;
  stopped: number;
  unknown: number;
}

const ServicesStatus: React.FC = () => {
  const [services, setServices] = useState<Service[]>([]);
  const [stats, setStats] = useState<ServicesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'stopped':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Activity className="h-4 w-4 text-yellow-500" />;
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

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'backend-core':
        return 'bg-blue-100 text-blue-800';
      case 'backend-email':
        return 'bg-green-100 text-green-800';
      case 'backend-password':
        return 'bg-purple-100 text-purple-800';
      case 'frontend':
        return 'bg-orange-100 text-orange-800';
      case 'infrastructure':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const fetchServices = async () => {
    try {
      setLoading(true);
      const response = await adminService.getServicesStatus();
      setServices(response.data.services || []);
      setStats(response.data);
      setError(null);
    } catch (err: any) {
      setError(`Erreur lors du chargement des services: ${err.message}`);
      console.error('Failed to load services:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleServiceAction = async (serviceName: string, action: 'start' | 'stop' | 'restart') => {
    try {
      setActionLoading(`${serviceName}-${action}`);
      const response = await adminService.controlService(serviceName, action);
      
      if (response.data.success) {
        toast.success(`Service ${serviceName} ${action}é avec succès`);
        // Rafraîchir la liste des services après 2 secondes
        setTimeout(() => {
          fetchServices();
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
    fetchServices();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin" />
        <span className="ml-2">Chargement des services...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestion des services</h1>
          <p className="text-gray-600">
            {stats ? `${stats.running} actifs, ${stats.stopped} arrêtés, ${stats.unknown} inconnus` : ''}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={fetchServices}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Actualiser
        </Button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <AlertCircle className="h-5 w-5 text-red-400" />
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Erreur</h3>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Actifs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.running}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Arrêtés</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{stats.stopped}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Inconnus</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{stats.unknown}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Services List */}
      <Card>
        <CardHeader>
          <CardTitle>Liste des services</CardTitle>
        </CardHeader>
        <CardContent>
          {services.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Server className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>Aucun service trouvé</p>
            </div>
          ) : (
            <div className="space-y-4">
              {services.map((service) => (
                <div
                  key={service.name}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50"
                >
                  <div className="flex items-center space-x-4">
                    <div className="flex-shrink-0">
                      <Server className="h-8 w-8 text-gray-500" />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <Link
                          to={`/services/${service.name}`}
                          className="text-sm font-medium text-gray-900 hover:text-blue-600"
                        >
                          {service.description}
                        </Link>
                        {getStatusIcon(service.status)}
                      </div>
                      <p className="text-sm text-gray-500">{service.name}</p>
                      <div className="flex items-center space-x-2 mt-1">
                        <Badge className={getStatusColor(service.status)}>
                          {service.status}
                        </Badge>
                        <Badge className={getTypeColor(service.type)}>
                          {service.type}
                        </Badge>
                        <span className="text-xs text-gray-500">
                          Port {service.port}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleServiceAction(service.name, 'start')}
                      disabled={actionLoading !== null || service.status === 'running'}
                    >
                      {actionLoading === `${service.name}-start` ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                    </Button>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleServiceAction(service.name, 'stop')}
                      disabled={actionLoading !== null || service.status === 'stopped'}
                    >
                      {actionLoading === `${service.name}-stop` ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <Square className="h-4 w-4" />
                      )}
                    </Button>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleServiceAction(service.name, 'restart')}
                      disabled={actionLoading !== null}
                    >
                      {actionLoading === `${service.name}-restart` ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <RotateCcw className="h-4 w-4" />
                      )}
                    </Button>
                    
                    <Link to={`/services/${service.name}`}>
                      <Button variant="outline" size="sm">
                        <Eye className="h-4 w-4" />
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ServicesStatus;