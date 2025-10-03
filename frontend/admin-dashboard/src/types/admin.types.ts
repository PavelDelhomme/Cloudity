export interface Database {
  id: string;
  name: string;
  size: string;
  tables: TableInfo[];
}

export interface TableInfo {
  name: string;
  type: string;
  rows: number;
  size: string;
}

export interface Tenant {
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

export interface CreateTenant {
  name: string;
  subdomain: string;
  max_users: number;
  max_storage_gb: number;
  status?: 'active' | 'inactive' | 'suspended';
}

export interface UpdateTenant {
  name?: string;
  subdomain?: string;
  max_users?: number;
  max_storage_gb?: number;
  status?: 'active' | 'inactive' | 'suspended';
}

export interface User {
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

export interface CreateUser {
  email: string;
  first_name: string;
  last_name: string;
  password: string;
  role: 'admin' | 'user' | 'moderator';
  tenant_id: string;
}

export interface UpdateUser {
  first_name?: string;
  last_name?: string;
  role?: 'admin' | 'user' | 'moderator';
  is_active?: boolean;
}

export interface Service {
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

export interface ServicesResponse {
  services: Service[];
  total: number;
  running: number;
  stopped: number;
  unknown: number;
}

export interface ServiceAction {
  action: string;
  service: string;
}

export interface ServiceLogs {
  service: string;
  logs: string;
  lines: number;
  error?: string;
  timestamp?: string;
  note?: string;
}

export interface SystemStats {
  total_users: number;
  total_tenants: number;
  total_services: number;
  running_services: number;
  stopped_services: number;
  unknown_services: number;
}

export interface DatabaseInfo {
  database: string;
  size: string;
  tables: TableInfo[];
  total_tables: number;
}

export interface QueryResult {
  query: string;
  results: any[];
  count: number;
}