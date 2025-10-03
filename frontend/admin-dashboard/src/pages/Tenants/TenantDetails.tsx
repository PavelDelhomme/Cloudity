import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  ArrowLeft, 
  Users, 
  Globe, 
  Settings, 
  HardDrive,
  Calendar,
  Edit,
  Save,
  X,
  RefreshCw,
  AlertCircle,
  CheckCircle
} from 'lucide-react';
import { adminService } from '@/services/admin.service';
import { toast } from 'sonner';

interface Tenant {
  id: string;
  name: string;
  subdomain: string;
  status: 'active' | 'inactive' | 'suspended';
  max_users: number;
  max_storage_gb: number;
  created_at: string;
  users_count?: number;
  storage_used_gb?: number;
}

interface TenantUpdate {
  name?: string;
  subdomain?: string;
  max_users?: number;
  max_storage_gb?: number;
  status?: 'active' | 'inactive' | 'suspended';
}

const TenantDetails: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<TenantUpdate>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'inactive':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      case 'suspended':
        return <X className="h-4 w-4 text-red-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'inactive':
        return 'bg-yellow-100 text-yellow-800';
      case 'suspended':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const fetchTenantDetails = async () => {
    if (!tenantId) return;
    
    try {
      setLoading(true);
      const response = await adminService.getTenants();
      const tenantData = response.data.find((t: Tenant) => t.id === tenantId);
      
      if (tenantData) {
        setTenant(tenantData);
        setError(null);
      } else {
        setError(`Tenant "${tenantId}" non trouvé`);
      }
    } catch (err) {
      setError('Erreur lors du chargement des détails du tenant');
      console.error('Error fetching tenant details:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = () => {
    if (tenant) {
      setEditData({
        name: tenant.name,
        subdomain: tenant.subdomain,
        max_users: tenant.max_users,
        max_storage_gb: tenant.max_storage_gb,
        status: tenant.status
      });
      setEditing(true);
    }
  };

  const handleSave = async () => {
    if (!tenant || !tenantId) return;
    
    try {
      setSaving(true);
      const response = await adminService.updateTenant(tenantId, editData);
      
      if (response.data) {
        setTenant(response.data);
        setEditing(false);
        toast.success('Tenant mis à jour avec succès');
      }
    } catch (err: any) {
      console.error('Error updating tenant:', err);
      toast.error(`Erreur lors de la mise à jour: ${err.response?.data?.detail || err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditData({});
    setEditing(false);
  };

  useEffect(() => {
    fetchTenantDetails();
  }, [tenantId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin" />
        <span className="ml-2">Chargement des détails du tenant...</span>
      </div>
    );
  }

  if (error || !tenant) {
    return (
      <div className="space-y-4">
        <Button
          variant="outline"
          onClick={() => navigate('/tenants')}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Retour aux tenants
        </Button>
        
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error || 'Tenant non trouvé'}
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
            onClick={() => navigate('/tenants')}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Retour
          </Button>
          
          <div>
            <h1 className="text-2xl font-bold">{tenant.name}</h1>
            <p className="text-muted-foreground">{tenant.subdomain}</p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {getStatusIcon(tenant.status)}
          <Badge className={getStatusColor(tenant.status)}>
            {tenant.status}
          </Badge>
        </div>
      </div>

      {/* Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Settings className="h-5 w-5 mr-2" />
            Actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex space-x-2">
            {editing ? (
              <>
                <Button
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Sauvegarder
                </Button>
                <Button
                  onClick={handleCancel}
                  variant="outline"
                  disabled={saving}
                >
                  <X className="h-4 w-4 mr-2" />
                  Annuler
                </Button>
              </>
            ) : (
              <Button
                onClick={handleEdit}
                variant="outline"
              >
                <Edit className="h-4 w-4 mr-2" />
                Modifier
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Details */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Vue d'ensemble</TabsTrigger>
          <TabsTrigger value="settings">Paramètres</TabsTrigger>
          <TabsTrigger value="users">Utilisateurs</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Basic Info */}
            <Card>
              <CardHeader>
                <CardTitle>Informations de base</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">ID</label>
                  <p className="text-sm font-mono">{tenant.id}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Nom</label>
                  <p className="text-sm">{tenant.name}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Sous-domaine</label>
                  <div className="flex items-center space-x-2">
                    <p className="text-sm font-mono">{tenant.subdomain}</p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => window.open(`https://${tenant.subdomain}.cloudity.local`, '_blank')}
                    >
                      <Globe className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Créé le</label>
                  <p className="text-sm">{new Date(tenant.created_at).toLocaleString()}</p>
                </div>
              </CardContent>
            </Card>

            {/* Usage Stats */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Users className="h-5 w-5 mr-2" />
                  Utilisation
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Utilisateurs</label>
                  <div className="flex items-center space-x-2">
                    <p className="text-sm">{tenant.users_count || 0}</p>
                    <span className="text-muted-foreground">/ {tenant.max_users}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                    <div 
                      className="bg-blue-600 h-2 rounded-full" 
                      style={{ width: `${((tenant.users_count || 0) / tenant.max_users) * 100}%` }}
                    ></div>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Stockage</label>
                  <div className="flex items-center space-x-2">
                    <p className="text-sm">{tenant.storage_used_gb || 0} GB</p>
                    <span className="text-muted-foreground">/ {tenant.max_storage_gb} GB</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                    <div 
                      className="bg-green-600 h-2 rounded-full" 
                      style={{ width: `${((tenant.storage_used_gb || 0) / tenant.max_storage_gb) * 100}%` }}
                    ></div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Limits */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <HardDrive className="h-5 w-5 mr-2" />
                  Limites
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Utilisateurs max</label>
                  <p className="text-sm">{tenant.max_users}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Stockage max</label>
                  <p className="text-sm">{tenant.max_storage_gb} GB</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Statut</label>
                  <Badge className={getStatusColor(tenant.status)}>
                    {tenant.status}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Paramètres du tenant</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">Nom</Label>
                  <Input
                    id="name"
                    value={editing ? editData.name || '' : tenant.name}
                    onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                    disabled={!editing}
                  />
                </div>
                
                <div>
                  <Label htmlFor="subdomain">Sous-domaine</Label>
                  <Input
                    id="subdomain"
                    value={editing ? editData.subdomain || '' : tenant.subdomain}
                    onChange={(e) => setEditData({ ...editData, subdomain: e.target.value })}
                    disabled={!editing}
                  />
                </div>
                
                <div>
                  <Label htmlFor="max_users">Utilisateurs maximum</Label>
                  <Input
                    id="max_users"
                    type="number"
                    value={editing ? editData.max_users || 0 : tenant.max_users}
                    onChange={(e) => setEditData({ ...editData, max_users: parseInt(e.target.value) })}
                    disabled={!editing}
                  />
                </div>
                
                <div>
                  <Label htmlFor="max_storage">Stockage maximum (GB)</Label>
                  <Input
                    id="max_storage"
                    type="number"
                    value={editing ? editData.max_storage_gb || 0 : tenant.max_storage_gb}
                    onChange={(e) => setEditData({ ...editData, max_storage_gb: parseInt(e.target.value) })}
                    disabled={!editing}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Utilisateurs du tenant</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-8 w-8 mx-auto mb-2" />
                <p>Liste des utilisateurs en cours d'implémentation</p>
                <p className="text-sm">Cette fonctionnalité sera disponible prochainement</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default TenantDetails;
