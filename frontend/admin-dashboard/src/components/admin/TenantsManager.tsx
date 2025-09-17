import React, { useState, useEffect } from 'react';
import { adminService, Tenant, CreateTenant, UpdateTenant } from '../../services/admin.service';

interface TenantsManagerProps {}

export const TenantsManager: React.FC<TenantsManagerProps> = () => {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [formData, setFormData] = useState<CreateTenant>({
    name: '',
    subdomain: '',
    max_users: 10,
    max_storage_gb: 100
  });

  useEffect(() => {
    loadTenants();
  }, []);

  const loadTenants = async () => {
    try {
      setLoading(true);
      const response = await adminService.getTenants();
      setTenants(response.data);
    } catch (error) {
      console.error('Error loading tenants:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await adminService.createTenant(formData);
      setShowCreateModal(false);
      setFormData({ name: '', subdomain: '', max_users: 10, max_storage_gb: 100 });
      loadTenants();
    } catch (error) {
      console.error('Error creating tenant:', error);
    }
  };

  const handleUpdate = async (id: string, data: UpdateTenant) => {
    try {
      await adminService.updateTenant(id, data);
      setEditingTenant(null);
      loadTenants();
    } catch (error) {
      console.error('Error updating tenant:', error);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (window.confirm(`Êtes-vous sûr de vouloir supprimer le tenant "${name}" ?`)) {
      try {
        await adminService.deleteTenant(id);
        loadTenants();
      } catch (error) {
        console.error('Error deleting tenant:', error);
      }
    }
  };

  const getStatusBadge = (status: string) => {
    const colorMap: Record<string, string> = {
      'active': 'bg-green-100 text-green-800',
      'inactive': 'bg-red-100 text-red-800',
      'suspended': 'bg-yellow-100 text-yellow-800'
    };
    return colorMap[status] || 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">🏢 Gestion des Tenants</h2>
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
        >
          + Nouveau Tenant
        </button>
      </div>

      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        <ul className="divide-y divide-gray-200">
          {tenants.map((tenant) => (
            <li key={tenant.id} className="px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-medium text-gray-900">
                        {tenant.name}
                      </h3>
                      <p className="text-sm text-gray-500">
                        Subdomain: {tenant.subdomain}
                      </p>
                    </div>
                    <span className={`px-2 py-1 text-xs rounded-full ${getStatusBadge(tenant.status)}`}>
                      {tenant.status}
                    </span>
                  </div>
                  <div className="mt-2 flex space-x-4 text-sm text-gray-500">
                    <span>👥 {tenant.max_users} utilisateurs max</span>
                    <span>💾 {tenant.max_storage_gb}GB stockage</span>
                    <span>📅 Créé: {new Date(tenant.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="flex space-x-2 ml-4">
                  <button
                    onClick={() => setEditingTenant(tenant)}
                    className="bg-yellow-500 hover:bg-yellow-700 text-white font-bold py-1 px-3 rounded text-sm"
                  >
                    ✏️ Modifier
                  </button>
                  <button
                    onClick={() => handleDelete(tenant.id, tenant.name)}
                    className="bg-red-500 hover:bg-red-700 text-white font-bold py-1 px-3 rounded text-sm"
                  >
                    🗑️ Supprimer
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Modal Créer Tenant */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Créer un nouveau tenant</h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <input
                type="text"
                placeholder="Nom du tenant"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
              <input
                type="text"
                placeholder="Subdomain"
                value={formData.subdomain}
                onChange={(e) => setFormData({...formData, subdomain: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
              <input
                type="number"
                placeholder="Max utilisateurs"
                value={formData.max_users}
                onChange={(e) => setFormData({...formData, max_users: parseInt(e.target.value)})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
              <input
                type="number"
                placeholder="Max stockage (GB)"
                value={formData.max_storage_gb}
                onChange={(e) => setFormData({...formData, max_storage_gb: parseInt(e.target.value)})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
              <div className="flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setFormData({ name: '', subdomain: '', max_users: 10, max_storage_gb: 100 });
                  }}
                  className="bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
                >
                  Créer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Éditer Tenant */}
      {editingTenant && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Modifier le tenant</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                const updateData: UpdateTenant = {
                  name: form.get('name') as string,
                  max_users: parseInt(form.get('max_users') as string),
                  max_storage_gb: parseInt(form.get('max_storage_gb') as string),
                  status: form.get('status') as string
                };
                handleUpdate(editingTenant.id, updateData);
              }}
              className="space-y-4"
            >
              <input
                name="name"
                type="text"
                defaultValue={editingTenant.name}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
              <input
                name="max_users"
                type="number"
                defaultValue={editingTenant.max_users}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
              <input
                name="max_storage_gb"
                type="number"
                defaultValue={editingTenant.max_storage_gb}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
              <select
                name="status"
                defaultValue={editingTenant.status}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="active">Actif</option>
                <option value="inactive">Inactif</option>
                <option value="suspended">Suspendu</option>
              </select>
              <div className="flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setEditingTenant(null)}
                  className="bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
                >
                  Sauvegarder
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};