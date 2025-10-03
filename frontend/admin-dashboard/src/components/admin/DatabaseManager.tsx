import React, { useState, useEffect } from 'react';
import { adminService, Database } from '../../services/admin.service';

export const DatabaseManager: React.FC = () => {
  const [databases, setDatabases] = useState<Database[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDatabases();
  }, []);

  const loadDatabases = async () => {
    try {
      setLoading(true);
      const response = await adminService.getDatabases();
      // L'API retourne directement un tableau, pas un objet avec .data
      setDatabases(Array.isArray(response) ? response : response.data || []);
    } catch (error) {
      console.error('Error loading databases:', error);
      setDatabases([]); // Fallback vers un tableau vide
    } finally {
      setLoading(false);
    }
  };

  const handleBackup = async (tenantId: string, tenantName: string) => {
    try {
      await adminService.backupDatabase(tenantId);
      alert(`Backup démarré pour ${tenantName}`);
    } catch (error) {
      console.error('Error creating backup:', error);
      alert('Erreur lors du backup');
    }
  };

  const getStatusBadge = (status: string) => {
    const colorMap: Record<string, string> = {
      'active': 'bg-green-100 text-green-800',
      'inactive': 'bg-red-100 text-red-800',
      'maintenance': 'bg-yellow-100 text-yellow-800'
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
        <h2 className="text-2xl font-bold text-gray-900">📊 Gestion des Bases de Données</h2>
        <button
          onClick={loadDatabases}
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
        >
          🔄 Actualiser
        </button>
      </div>

      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        <ul className="divide-y divide-gray-200">
          {databases.map((db) => (
            <li key={db.id} className="px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-medium text-gray-900">
                        {db.database_name}
                      </h3>
                      <p className="text-sm text-gray-500">
                        Tenant: {db.tenant_name}
                      </p>
                    </div>
                    <span className={`px-2 py-1 text-xs rounded-full ${getStatusBadge(db.status)}`}>
                      {db.status}
                    </span>
                  </div>
                  <div className="mt-2 flex space-x-4 text-sm text-gray-500">
                    <span>💾 Taille: {db.size}</span>
                    <span>🔗 Connexions: {db.connections}</span>
                    <span>📅 Dernier backup: {new Date(db.last_backup).toLocaleString()}</span>
                  </div>
                </div>
                <div className="flex space-x-2 ml-4">
                  <button
                    onClick={() => handleBackup(db.tenant_id, db.tenant_name)}
                    className="bg-green-500 hover:bg-green-700 text-white font-bold py-1 px-3 rounded text-sm"
                  >
                    💾 Backup
                  </button>
                  <button
                    className="bg-gray-500 hover:bg-gray-700 text-white font-bold py-1 px-3 rounded text-sm"
                    title="Fonctionnalité à venir"
                  >
                    ⚙️ Config
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};