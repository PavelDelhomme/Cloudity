export const API_CONFIG = {
    BASE_URL: 'http://localhost:8082',
    TIMEOUT: 10000,
    HEADERS: {
        'Content-Type': 'application/json',
    }
};

export const ENDPOINTS = {
    STATS: '/api/v1/admin/stats',
    SERVICES: '/api/v1/admin/services/detailed',
    USERS: '/api/v1/admin/users',
    TENANTS: '/api/v1/admin/tenants',
    LOGS: '/api/v1/admin/logs',
    CONTROL_SERVICE: (name: string, action: string) => `/api/v1/admin/services/${name}/${action}`
};