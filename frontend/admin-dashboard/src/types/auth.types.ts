export interface User {
    id: string;
    email: string;
    first_name?: string;
    last_name?: string;
    role: string;
    tenant_id: string;
    is_active: boolean;
    created_at: string;
}

export interface LoginCredentials {
    email: string;
    password: string;
}

export interface AuthResponse {
    access_token: string;
    refresh_token?: string;
    user: User;
    expires_in?: number;
}