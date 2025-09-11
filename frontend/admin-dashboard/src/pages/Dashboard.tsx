import React, { useEffect, useState } from 'react';
import StatsCard from '../components/Charts/StatsCard';
import { adminService } from '../services/admin.service';
import { SystemStats } from '../types/admin.types';

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const [statsData, servicesData] = await Promise.all([
        adminService.getSystemStats(),
        adminService.getServicesStatus()
      ]);
      setStats(statsData);
      setServices(servicesData.services);
    } catch (error) {
      console.error('Erreur chargement dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div>Chargement...</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard Administrateur</h1>
      
      {/* Statistiques */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatsCard
          title="Utilisateurs"
          value={stats?.total_users || 0}
          icon="👥"
          color="blue"
        />
        <StatsCard
          title="Tenants"
          value={stats?.total_tenants || 0}
          icon="🏢"
          color="green"
        />
        <StatsCard
          title="Sessions Actives"
          value={stats?.active_sessions || 0}
          icon="🟢"
          color="yellow"
        />
        <StatsCard
          title="Taille BDD"
          value={stats?.database_size || "N/A"}
          icon="💾"
          color="purple"
        />
      </div>

      {/* État des Services */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">État des Services</h2>
        <div className="space-y-3">
          {services.map((service: any) => (
            <div
              key={service.name}
              className="flex items-center justify-between p-3 border rounded"
            >
              <div>
                <span className="font-medium">{service.name}</span>
                <span className="text-sm text-gray-500 ml-2">
                  Port {service.port}
                </span>
              </div>
              <div className="flex items-center space-x-3">
                <span
                  className={`px-2 py-1 text-xs rounded ${
                    service.status === 'running'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
                  }`}
                >
                  {service.status}
                </span>
                <button
                  onClick={() => handleServiceAction(service.name, 'restart')}
                  className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                  Redémarrer
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const handleServiceAction = async (serviceName: string, action: string) => {
  try {
    await adminService.controlService(serviceName, action);
    // Recharger les données
    window.location.reload();
  } catch (error) {
    console.error('Erreur action service:', error);
    alert('Erreur lors de l\'action sur le service');
  }
};

export default Dashboard;