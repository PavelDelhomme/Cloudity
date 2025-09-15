import api from './api';

export interface LoginRequest {
    email: string;
    password: string;
}

export interface LoginResponse {
    access_token: string;
    user_id: string;
    user: {
        id: string;
        email: string;
        role: string;
    };
    message: string;
}

export const authService = {
    login: async (credentials: LoginRequest): Promise<LoginResponse> => {
        const response = await fetch('http://localhost:8000/api/v1/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Tenant-ID': 'admin'
            },
            body: JSON.stringify(credentials)
        });

        if (!response.ok) {
            throw new Error('Login failed');
        }

        return response.json();
    },

    logout: () => {
        localStorage.removeItem('admin-token');
        localStorage.removeItem('admin-user');
    },

    getCurrentUser: () => {
        const userData = localStorage.getItem('admin-user');
        return userData ? JSON.parse(userData) : null;
    },

    getToken: () => {
        return localStorage.getItem('admin-token');
    },

    isAuthenticated: () => {
        return !!localStorage.getItem('admin-token');
    }
};

export default authService;