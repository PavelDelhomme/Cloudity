import api from './api';
import { ENDPOINTS } from '../config/api';

export const adminService = {
  // Statistiques
  getSystemStats: () => api.get(ENDPOINTS.STATS),
  
  // Services
  getServicesStatus: () => api.get(ENDPOINTS.SERVICES),
  controlService: (name: string, action: string) => 
    api.post(ENDPOINTS.CONTROL_SERVICE(name, action)),
  getServiceLogs: (name: string, lines = 100) => 
    api.get(`${ENDPOINTS.LOGS}/${name}`, { params: { lines } }),
  
  // Utilisateurs
  getUsers: () => api.get(ENDPOINTS.USERS),
  createUser: (userData: any) => api.post(ENDPOINTS.USERS, userData),
  updateUser: (id: string, userData: any) => api.put(`${ENDPOINTS.USERS}/${id}`, userData),
  deleteUser: (id: string) => api.delete(`${ENDPOINTS.USERS}/${id}`),
  
  // Tenants
  getTenants: () => api.get(ENDPOINTS.TENANTS),
  createTenant: (tenantData: any) => api.post(ENDPOINTS.TENANTS, tenantData),
  updateTenant: (id: string, tenantData: any) => api.put(`${ENDPOINTS.TENANTS}/${id}`, tenantData),
  deleteTenant: (id: string) => api.delete(`${ENDPOINTS.TENANTS}/${id}`),
  
  // Configuration email
  getEmailConfig: (tenantId: string) => 
    api.get(`/api/v1/admin/email-config/${tenantId}`),
  updateEmailConfig: (tenantId: string, config: any) => 
    api.put(`/api/v1/admin/email-config/${tenantId}`, config),
  
  // Base de données
  getDatabaseSchema: () => api.get('/api/v1/admin/database/schema'),
  executeQuery: (query: string) => 
    api.get('/api/v1/admin/database/query', { params: { query } }),
};

export default adminService;