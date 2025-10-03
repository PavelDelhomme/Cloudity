import api from './api';
import { ENDPOINTS } from '../config/api';
import { 
  Database, 
  Tenant, 
  CreateTenant, 
  UpdateTenant, 
  User, 
  CreateUser, 
  UpdateUser,
  ServicesResponse,
  ServiceLogs,
  SystemStats,
  DatabaseInfo,
  QueryResult
} from '../types/admin.types';

export const adminService = {
  // Statistiques
  getSystemStats: (): Promise<{ data: SystemStats }> => api.get(ENDPOINTS.STATS),
  
  // Services
  getServicesStatus: (): Promise<{ data: ServicesResponse }> => api.get(ENDPOINTS.SERVICES),
  controlService: (name: string, action: string) => 
    api.post(ENDPOINTS.CONTROL_SERVICE(name, action)),
  getServiceLogs: (name: string, lines = 100): Promise<{ data: ServiceLogs }> => 
    api.get(`${ENDPOINTS.LOGS}/${name}`, { params: { lines } }),
  
  // Utilisateurs
  getUsers: (): Promise<{ data: User[] }> => api.get(ENDPOINTS.USERS),
  createUser: (userData: CreateUser) => api.post(ENDPOINTS.USERS, userData),
  updateUser: (id: string, userData: UpdateUser) => api.put(`${ENDPOINTS.USERS}/${id}`, userData),
  deleteUser: (id: string) => api.delete(`${ENDPOINTS.USERS}/${id}`),
  
  // Tenants
  getTenants: (): Promise<{ data: Tenant[] }> => api.get(ENDPOINTS.TENANTS),
  createTenant: (tenantData: CreateTenant) => api.post(ENDPOINTS.TENANTS, tenantData),
  updateTenant: (id: string, tenantData: UpdateTenant) => api.put(`${ENDPOINTS.TENANTS}/${id}`, tenantData),
  deleteTenant: (id: string) => api.delete(`${ENDPOINTS.TENANTS}/${id}`),
  
  // Configuration email
  getEmailConfig: (tenantId: string) => 
    api.get(`/api/v1/admin/email-config/${tenantId}`),
  updateEmailConfig: (tenantId: string, config: any) => 
    api.put(`/api/v1/admin/email-config/${tenantId}`, config),
  
  // Base de données
  getDatabases: (): Promise<{ data: DatabaseInfo }> => api.get(ENDPOINTS.DATABASES),
  backupDatabase: (tableName: string) => api.post(`/api/v1/admin/databases/${tableName}/backup`),
  getDatabaseSchema: () => api.get('/api/v1/admin/database/schema'),
  executeQuery: (query: string): Promise<{ data: QueryResult }> => 
    api.get('/api/v1/admin/database/query', { params: { query } }),
};

export default adminService;