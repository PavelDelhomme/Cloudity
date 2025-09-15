import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { API_CONFIG } from '../config/api';


class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_CONFIG.BASE_URL,
      timeout: API_CONFIG.TIMEOUT,
      headers: API_CONFIG.HEADERS,
    });

    // Intercepteur pour les réponses
    this.client.interceptors.response.use(
      (response: AxiosResponse) => {
        return response.data;
      },
      (error) => {
        console.error('API Error:', error);
        if (error.response?.status === 401) {
          localStorage.removeItem('admin-token');
          localStorage.removeItem('admin-user');
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }
    );

    // Intercepteur pour les requêtes (ajouter token si disponible)
    this.client.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('admin-token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );
  }

  get<T>(url: string, params?: any): Promise<T> {
    return this.client.get(url, { params });
  }

  post<T>(url: string, data?: any): Promise<T> {
    return this.client.post(url, data);
  }

  put<T>(url: string, data?: any): Promise<T> {
    return this.client.put(url, data);
  }

  delete<T>(url: string): Promise<T> {
    return this.client.delete(url);
  }
}

const api = new ApiClient();
export default api;