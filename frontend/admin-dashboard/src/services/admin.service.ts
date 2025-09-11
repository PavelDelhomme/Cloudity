import api from './api';

export const adminService = {
  // Statistiques
  getSystemStats: () => api.get('/admin/stats'),
  
  // Services
  getServicesStatus: () => api.get('/admin/services/detailed'),
  controlService: (name: string, action: string) => 
    api.post(`/admin/services/${name}/${action}`),
  getServiceLogs: (name: string, lines = 100) => 
    api.get(`/admin/logs/${name}`, { params: { lines } }),
  
  // Utilisateurs
  getUsers: () => api.get('/admin/users'),
  createUser: (userData: any) => api.post('/admin/users', userData),
  
  // Tenants
  getTenants: () => api.get('/admin/tenants'),
  createTenant: (tenantData: any) => api.post('/admin/tenants', tenantData),
  
  // Groupes
  getUserGroups: (tenantId?: string) => 
    api.get('/admin/groups', tenantId ? { params: { tenant_id: tenantId } } : {}),
  createUserGroup: (groupData: any) => api.post('/admin/groups', groupData),
  
  // Configuration email
  getEmailConfig: (tenantId: string) => 
    api.get(`/admin/email-config/${tenantId}`),
  updateEmailConfig: (tenantId: string, config: any) => 
    api.put(`/admin/email-config/${tenantId}`, config),
  
  // Base de données
  getDatabaseSchema: () => api.get('/admin/database/schema'),
  executeQuery: (query: string) => 
    api.get('/admin/database/query', { params: { query } }),
};