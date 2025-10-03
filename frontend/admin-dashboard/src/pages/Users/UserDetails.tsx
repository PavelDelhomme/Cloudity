import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  ArrowLeft, 
  User, 
  Mail, 
  Calendar,
  Shield,
  Edit,
  Save,
  X,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  UserCheck,
  UserX
} from 'lucide-react';
import { adminService } from '@/services/admin.service';
import { toast } from 'sonner';

interface UserDetails {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: 'admin' | 'user' | 'moderator';
  is_active: boolean;
  created_at: string;
  tenant_id?: string;
  last_login?: string;
  login_count?: number;
}

interface UserUpdate {
  first_name?: string;
  last_name?: string;
  role?: 'admin' | 'user' | 'moderator';
  is_active?: boolean;
}

const UserDetails: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [user, setUser] = useState<UserDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<UserUpdate>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'admin':
        return <Shield className="h-4 w-4 text-red-500" />;
      case 'moderator':
        return <UserCheck className="h-4 w-4 text-blue-500" />;
      default:
        return <User className="h-4 w-4 text-green-500" />;
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin':
        return 'bg-red-100 text-red-800';
      case 'moderator':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-green-100 text-green-800';
    }
  };

  const getStatusIcon = (isActive: boolean) => {
    return isActive ? 
      <CheckCircle className="h-4 w-4 text-green-500" /> : 
      <UserX className="h-4 w-4 text-red-500" />;
  };

  const getStatusColor = (isActive: boolean) => {
    return isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
  };

  const fetchUserDetails = async () => {
    if (!userId) return;
    
    try {
      setLoading(true);
      const response = await adminService.getUsers();
      const userData = response.data.find((u: UserDetails) => u.id === userId);
      
      if (userData) {
        setUser(userData);
        setError(null);
      } else {
        setError(`Utilisateur "${userId}" non trouvé`);
      }
    } catch (err) {
      setError('Erreur lors du chargement des détails de l\'utilisateur');
      console.error('Error fetching user details:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = () => {
    if (user) {
      setEditData({
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
        is_active: user.is_active
      });
      setEditing(true);
    }
  };

  const handleSave = async () => {
    if (!user || !userId) return;
    
    try {
      setSaving(true);
      const response = await adminService.updateUser(userId, editData);
      
      if (response.data) {
        setUser(response.data);
        setEditing(false);
        toast.success('Utilisateur mis à jour avec succès');
      }
    } catch (err: any) {
      console.error('Error updating user:', err);
      toast.error(`Erreur lors de la mise à jour: ${err.response?.data?.detail || err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditData({});
    setEditing(false);
  };

  const handleToggleActive = async () => {
    if (!user || !userId) return;
    
    try {
      setSaving(true);
      const response = await adminService.updateUser(userId, { is_active: !user.is_active });
      
      if (response.data) {
        setUser(response.data);
        toast.success(`Utilisateur ${user.is_active ? 'désactivé' : 'activé'} avec succès`);
      }
    } catch (err: any) {
      console.error('Error toggling user status:', err);
      toast.error(`Erreur lors de la modification du statut: ${err.response?.data?.detail || err.message}`);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    fetchUserDetails();
  }, [userId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin" />
        <span className="ml-2">Chargement des détails de l'utilisateur...</span>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="space-y-4">
        <Button
          variant="outline"
          onClick={() => navigate('/users')}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Retour aux utilisateurs
        </Button>
        
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error || 'Utilisateur non trouvé'}
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
            onClick={() => navigate('/users')}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Retour
          </Button>
          
          <div>
            <h1 className="text-2xl font-bold">{user.first_name} {user.last_name}</h1>
            <p className="text-muted-foreground">{user.email}</p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {getStatusIcon(user.is_active)}
          <Badge className={getStatusColor(user.is_active)}>
            {user.is_active ? 'Actif' : 'Inactif'}
          </Badge>
        </div>
      </div>

      {/* Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <User className="h-5 w-5 mr-2" />
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
              <>
                <Button
                  onClick={handleEdit}
                  variant="outline"
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Modifier
                </Button>
                <Button
                  onClick={handleToggleActive}
                  variant="outline"
                  disabled={saving}
                >
                  {saving ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : user.is_active ? (
                    <UserX className="h-4 w-4 mr-2" />
                  ) : (
                    <UserCheck className="h-4 w-4 mr-2" />
                  )}
                  {user.is_active ? 'Désactiver' : 'Activer'}
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Details */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Vue d'ensemble</TabsTrigger>
          <TabsTrigger value="settings">Paramètres</TabsTrigger>
          <TabsTrigger value="activity">Activité</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Basic Info */}
            <Card>
              <CardHeader>
                <CardTitle>Informations personnelles</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">ID</label>
                  <p className="text-sm font-mono">{user.id}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Nom complet</label>
                  <p className="text-sm">{user.first_name} {user.last_name}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Email</label>
                  <div className="flex items-center space-x-2">
                    <p className="text-sm">{user.email}</p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => window.open(`mailto:${user.email}`, '_blank')}
                    >
                      <Mail className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Créé le</label>
                  <p className="text-sm">{new Date(user.created_at).toLocaleString()}</p>
                </div>
              </CardContent>
            </Card>

            {/* Account Info */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Shield className="h-5 w-5 mr-2" />
                  Compte
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Rôle</label>
                  <div className="flex items-center space-x-2">
                    {getRoleIcon(user.role)}
                    <Badge className={getRoleColor(user.role)}>
                      {user.role}
                    </Badge>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Statut</label>
                  <div className="flex items-center space-x-2">
                    {getStatusIcon(user.is_active)}
                    <Badge className={getStatusColor(user.is_active)}>
                      {user.is_active ? 'Actif' : 'Inactif'}
                    </Badge>
                  </div>
                </div>
                {user.last_login && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Dernière connexion</label>
                    <p className="text-sm">{new Date(user.last_login).toLocaleString()}</p>
                  </div>
                )}
                {user.login_count !== undefined && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Nombre de connexions</label>
                    <p className="text-sm">{user.login_count}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Paramètres du compte</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="first_name">Prénom</Label>
                  <Input
                    id="first_name"
                    value={editing ? editData.first_name || '' : user.first_name}
                    onChange={(e) => setEditData({ ...editData, first_name: e.target.value })}
                    disabled={!editing}
                  />
                </div>
                
                <div>
                  <Label htmlFor="last_name">Nom</Label>
                  <Input
                    id="last_name"
                    value={editing ? editData.last_name || '' : user.last_name}
                    onChange={(e) => setEditData({ ...editData, last_name: e.target.value })}
                    disabled={!editing}
                  />
                </div>
                
                <div>
                  <Label htmlFor="role">Rôle</Label>
                  <Select
                    value={editing ? editData.role || user.role : user.role}
                    onValueChange={(value) => setEditData({ ...editData, role: value as any })}
                    disabled={!editing}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">Utilisateur</SelectItem>
                      <SelectItem value="moderator">Modérateur</SelectItem>
                      <SelectItem value="admin">Administrateur</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label htmlFor="is_active">Statut</Label>
                  <Select
                    value={editing ? (editData.is_active !== undefined ? editData.is_active.toString() : user.is_active.toString()) : user.is_active.toString()}
                    onValueChange={(value) => setEditData({ ...editData, is_active: value === 'true' })}
                    disabled={!editing}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Actif</SelectItem>
                      <SelectItem value="false">Inactif</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Calendar className="h-5 w-5 mr-2" />
                Activité récente
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                <Calendar className="h-8 w-8 mx-auto mb-2" />
                <p>Historique d'activité en cours d'implémentation</p>
                <p className="text-sm">Cette fonctionnalité sera disponible prochainement</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default UserDetails;
