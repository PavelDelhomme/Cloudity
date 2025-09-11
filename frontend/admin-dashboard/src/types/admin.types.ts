export interface SystemStats {
  total_users: number;
  total_tenants: number;
  active_sessions: number;
  storage_used: number;
  database_size: string;
  uptime: string;
}

export interface ServiceStatus {
  name: string;
  container: string;
  status: string;
  port: number;
  url: string;
  uptime?: string;
  image?: string;
  started_at?: string;
}

export interface User {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  role: string;
  is_active: boolean;
  tenant_name: string;
  created_at: string;
}

export interface Tenant {
  id: string;
  name: string;
  subdomain?: string;
  status: string;
  max_users: number;
  max_storage_gb: number;
  created_at: string;
}

export interface UserGroup {
  id: string;
  tenant_id: string;
  name: string;
  description?: string;
  permissions: string[];
  created_at: string;
}

export interface EmailConfig {
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_password: string;
  use_tls: boolean;
  use_ssl: boolean;
  from_email?: string;
  from_name?: string;
  is_active: boolean;
}