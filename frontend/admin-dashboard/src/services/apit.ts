import axios, { AxiosInstance, AxiosResponse } from 'axios';

const API_BASE_URL = 'http://localhost:8082';

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.client.interceptors.response.use(
      (response: AxiosResponse) => {
        // Gérer les réponses vides ou malformées
        if (!response.data) {
          return { data: null };
        }
        return response.data;
      },
      (error) => {
        console.error('API Error:', error);
        if (error.response?.status === 401) {
          localStorage.removeItem('auth_token');
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }
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