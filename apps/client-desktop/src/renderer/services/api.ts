const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8080';

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

class ApiService {
  private token: string | null = null;

  setToken(token: string | null): void {
    this.token = token;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${BACKEND_URL}${endpoint}`;
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.token) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${this.token}`;
    }

    // Add timeout for requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      let data;
      try {
        data = await response.json();
      } catch {
        // JSON parsing failed
        return {
          success: false,
          error: `Server error (${response.status})`,
        };
      }

      if (!response.ok) {
        return {
          success: false,
          error: data.error || data.message || `HTTP error ${response.status}`,
        };
      }

      return {
        success: true,
        data: data.data ?? data,
      };
    } catch (error: any) {
      clearTimeout(timeoutId);
      console.error(`API request failed: ${endpoint}`, error);

      if (error.name === 'AbortError') {
        return {
          success: false,
          error: 'Request timed out. Please check your connection.',
        };
      }

      return {
        success: false,
        error: error.message || 'Network error. Please check if the server is running.',
      };
    }
  }

  async get<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  async post<T>(endpoint: string, body?: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async put<T>(endpoint: string, body?: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }

  // Auth endpoints
  async login(username: string, password: string): Promise<ApiResponse<{ token: string; user: any }>> {
    return this.post('/api/auth/login', { username, password });
  }

  async checkSetup(): Promise<ApiResponse<{ setupRequired: boolean }>> {
    return this.get('/api/setup/status');
  }

  async getMe(): Promise<ApiResponse<any>> {
    return this.get('/api/auth/me');
  }

  // Server endpoints
  async getServers(): Promise<ApiResponse<any>> {
    return this.get('/api/connections');
  }

  async createConnectionToken(serverId: string): Promise<ApiResponse<{ token: string }>> {
    return this.post(`/api/connections/${serverId}/connect`);
  }
}

export const api = new ApiService();
