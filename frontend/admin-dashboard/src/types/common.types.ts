export interface ApiResponse<T> {
    data: T;
    message?: string;
    status: 'success' | 'error';
}

export interface PaginatedResponse<T> {
    data: T[];
    total: number;
    page: number;
    per_page: number;
    total_pages: number;
}

export interface ServiceStatus {
    name: string;
    container: string;
    status: 'running' | 'stopped' | 'error' | 'not_found';
    port: number;
    url: string;
    uptime?: string;
    image?: string;
    started_at?: string;
}

export interface SystemStats {
    total_users: number;
    total_tenants: number;
    active_sessions: number;
    storage_used: number;
    database_size: string;
    uptime: string;
}