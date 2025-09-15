export const API_ENDPOINTS = {
    AUTH: {
        LOGIN: '/api/v1/auth/login',
        LOGOUT: '/api/v1/auth/logout',
        REFRESH: '/api/v1/auth/refresh',
    },
    ADMIN: {
        STATS: '/api/v1/admin/stats',
        SERVICES: '/api/v1/admin/services/detailed',
        USERS: '/api/v1/admin/users',
        TENANTS: '/api/v1/admin/tenants',
        LOGS: '/api/v1/admin/logs',
    }
};

export const SERVICE_ACTIONS = {
    START: 'start',
    STOP: 'stop',
    RESTART: 'restart',
} as const;

export const USER_ROLES = {
    ADMIN: 'admin',
    USER: 'user',
    MODERATOR: 'moderator',
    GUEST: 'guest',
} as const;

export const SERVICE_STATUS = {
    RUNNING: 'running',
    STOPPED: 'stopped',
    ERROR: 'error',
    NOT_FOUND: 'not_found'
} as const;