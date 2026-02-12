const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8080';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  pagination?: {
    limit: number;
    offset: number;
    total: number;
  };
}

class ApiService {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  setToken(token: string | null) {
    this.token = token;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.token) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${this.token}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.error || `HTTP error ${response.status}`,
        };
      }

      return data;
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Network error',
      };
    }
  }

  // Generic methods
  async get<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint);
  }

  async post<T>(endpoint: string, data?: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async put<T>(endpoint: string, data?: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'DELETE',
    });
  }

  // Dashboard
  async getDashboardStats() {
    return this.request('/api/admin/dashboard/stats');
  }

  async getActivityFeed(limit = 20) {
    return this.request(`/api/admin/dashboard/activity?limit=${limit}`);
  }

  // Users
  async getUsers(params?: { search?: string; status?: string; limit?: number; offset?: number }) {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.status) query.set('status', params.status);
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.offset) query.set('offset', params.offset.toString());
    return this.request(`/api/admin/users?${query}`);
  }

  async createUser(data: { email: string; name: string; role?: string }) {
    return this.request('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateUser(id: string, data: Partial<{ email: string; name: string; role: string; enabled: boolean }>) {
    return this.request(`/api/admin/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteUser(id: string) {
    return this.request(`/api/admin/users/${id}`, {
      method: 'DELETE',
    });
  }

  // Servers
  async getServers(params?: { search?: string; status?: string }) {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.status) query.set('status', params.status);
    return this.request(`/api/admin/servers?${query}`);
  }

  async createServer(data: {
    name: string;
    host: string;
    port: number;
    protocol: string;
    username?: string;
    password?: string;
    description?: string;
  }) {
    return this.request('/api/admin/servers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateServer(id: string, data: Partial<{
    name: string;
    host: string;
    port: number;
    protocol: string;
    username: string;
    password: string;
    description: string;
    enabled: boolean;
  }>) {
    return this.request(`/api/admin/servers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteServer(id: string) {
    return this.request(`/api/admin/servers/${id}`, {
      method: 'DELETE',
    });
  }

  // Sessions
  async getSessions(params?: {
    status?: string;
    userId?: string;
    serverId?: string;
    riskLevel?: string;
    reviewed?: boolean;
    tags?: string[];
    search?: string;
    flag?: string;
    limit?: number;
    offset?: number;
  }) {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.userId) query.set('userId', params.userId);
    if (params?.serverId) query.set('serverId', params.serverId);
    if (params?.riskLevel) query.set('riskLevel', params.riskLevel);
    if (params?.reviewed !== undefined) query.set('reviewed', params.reviewed.toString());
    if (params?.tags && params.tags.length > 0) query.set('tags', params.tags.join(','));
    if (params?.search) query.set('search', params.search);
    if (params?.flag) query.set('flag', params.flag);
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.offset) query.set('offset', params.offset.toString());
    return this.request(`/api/sessions?${query}`);
  }

  async getActiveSessions() {
    return this.request('/api/sessions/active');
  }

  async getSession(id: string) {
    return this.request(`/api/sessions/${id}`);
  }

  async terminateSession(id: string) {
    return this.request(`/api/sessions/${id}/end`, {
      method: 'POST',
    });
  }

  async reanalyzeSession(id: string) {
    return this.request(`/api/admin/sessions/${id}/analyze`, {
      method: 'POST',
    });
  }

  async getSessionRecordingUrl(id: string) {
    return this.request(`/api/sessions/${id}/recording-url`);
  }

  // Session Review
  async markSessionReviewed(id: string, notes?: string) {
    return this.request(`/api/sessions/${id}/review`, {
      method: 'PATCH',
      body: JSON.stringify({ reviewed: true, notes }),
    });
  }

  async markSessionUnreviewed(id: string) {
    return this.request(`/api/sessions/${id}/review`, {
      method: 'PATCH',
      body: JSON.stringify({ reviewed: false }),
    });
  }

  // Session Tags
  async addSessionTag(sessionId: string, tag: string) {
    return this.request(`/api/sessions/${sessionId}/tags`, {
      method: 'POST',
      body: JSON.stringify({ tag }),
    });
  }

  async removeSessionTag(sessionId: string, tag: string) {
    return this.request(`/api/sessions/${sessionId}/tags/${encodeURIComponent(tag)}`, {
      method: 'DELETE',
    });
  }

  // Settings
  async getSettings() {
    return this.request('/api/admin/settings');
  }

  async updateSettings(settings: Record<string, any>) {
    return this.request('/api/admin/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  }

  // Audit Log
  async getAuditLog(params?: { limit?: number; offset?: number; action?: string }) {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.offset) query.set('offset', params.offset.toString());
    if (params?.action) query.set('action', params.action);
    return this.request(`/api/admin/audit-log?${query}`);
  }

  // Groups
  async getGroups() {
    return this.request('/api/groups');
  }

  async createGroup(data: { name: string; description?: string; color?: string }) {
    return this.request('/api/groups', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateGroup(id: string, data: Partial<{ name: string; description: string; color: string }>) {
    return this.request(`/api/groups/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteGroup(id: string) {
    return this.request(`/api/groups/${id}`, {
      method: 'DELETE',
    });
  }

  async getGroupMembers(groupId: string) {
    return this.request(`/api/groups/${groupId}/members`);
  }

  async addGroupMember(groupId: string, userId: string) {
    return this.request(`/api/groups/${groupId}/members`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
  }

  async removeGroupMember(groupId: string, userId: string) {
    return this.request(`/api/groups/${groupId}/members/${userId}`, {
      method: 'DELETE',
    });
  }

  // Server Access
  async getServerAccess(serverId: string) {
    return this.request(`/api/admin/servers/${serverId}/access`);
  }

  async grantUserServerAccess(serverId: string, userId: string) {
    return this.request(`/api/admin/servers/${serverId}/access/user`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
  }

  async grantGroupServerAccess(serverId: string, groupId: string) {
    return this.request(`/api/admin/servers/${serverId}/access/group`, {
      method: 'POST',
      body: JSON.stringify({ groupId }),
    });
  }

  async revokeServerAccess(serverId: string, accessId: string) {
    return this.request(`/api/admin/servers/${serverId}/access/${accessId}`, {
      method: 'DELETE',
    });
  }

  // Risk Alerts
  async getRiskAlerts() {
    return this.request('/api/admin/risk-alerts');
  }

  async acknowledgeRiskAlert(alertId: string) {
    return this.request(`/api/admin/risk-alerts/${alertId}/acknowledge`, {
      method: 'POST',
    });
  }

  async getSessionRiskAlerts(sessionId: string) {
    return this.request(`/api/admin/sessions/${sessionId}/risk-alerts`);
  }

  // Auth
  async changePassword(currentPassword: string, newPassword: string) {
    return this.request('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  }

  // Risk Analytics
  async getRiskStats() {
    return this.request('/api/sessions/risk/stats');
  }

  async getHighRiskUsers(limit = 10) {
    return this.request(`/api/sessions/risk/users?limit=${limit}`);
  }

  async getHighRiskServers(limit = 10) {
    return this.request(`/api/sessions/risk/servers?limit=${limit}`);
  }

  async getBehavioralPatternSummary() {
    return this.request('/api/sessions/risk/behavioral');
  }

  async getUserRiskProfile(userId: string) {
    return this.request(`/api/sessions/risk/users/${userId}`);
  }

  // Bans
  async createBan(data: {
    userId: string;
    reason: string;
    duration?: '1h' | '24h' | '7d' | '30d' | 'permanent';
    sessionId?: string;
  }) {
    return this.request('/api/bans', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async liftBan(banId: string) {
    return this.request(`/api/bans/${banId}/lift`, {
      method: 'POST',
    });
  }

  async getActiveBans() {
    return this.request('/api/bans');
  }

  async getRecentBans(limit = 10) {
    return this.request(`/api/bans/recent?limit=${limit}`);
  }

  async getUserBans(userId: string) {
    return this.request(`/api/bans/user/${userId}`);
  }

  async checkUserBanned(userId: string, serverId?: string) {
    const query = serverId ? `?serverId=${serverId}` : '';
    return this.request(`/api/bans/check/${userId}${query}`);
  }
}

export const api = new ApiService(API_BASE_URL);
