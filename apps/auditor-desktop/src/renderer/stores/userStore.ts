import { create } from 'zustand';
import { api } from '../services/api';

export interface User {
  id: string;
  username: string;
  display_name: string;
  email: string | null;
  role: 'super_admin' | 'admin' | 'auditor' | 'client';
  department: string | null;
  enabled: boolean;
  avatar_color: string;
  created_at: string;
  last_login_at?: string;
}

interface UserState {
  users: User[];
  loading: boolean;
  error: string | null;
  fetchUsers: (params?: { search?: string; role?: string }) => Promise<void>;
  createUser: (data: {
    username: string;
    password: string;
    displayName: string;
    role: 'admin' | 'auditor' | 'client';
    department?: string;
  }) => Promise<boolean>;
  updateUser: (id: string, data: Partial<{
    username: string;
    displayName: string;
    email: string;
    role: string;
    enabled: boolean;
    password: string;
  }>) => Promise<boolean>;
  deleteUser: (id: string) => Promise<boolean>;
  toggleUserEnabled: (id: string) => Promise<boolean>;
  resetPassword: (id: string, newPassword: string) => Promise<boolean>;
}

export const useUserStore = create<UserState>((set, get) => ({
  users: [],
  loading: false,
  error: null,

  fetchUsers: async (params) => {
    set({ loading: true, error: null });

    try {
      const response = await api.get<User[]>(`/api/users${params?.search ? `?search=${params.search}` : ''}${params?.role ? `${params?.search ? '&' : '?'}role=${params.role}` : ''}`);

      if (response.success && response.data) {
        set({ users: response.data, loading: false });
      } else {
        set({ error: response.error || 'Failed to fetch users', loading: false });
      }
    } catch (error: any) {
      set({ error: error.message, loading: false });
    }
  },

  createUser: async (data) => {
    set({ error: null });

    try {
      const response = await api.post('/api/users', data);

      if (response.success) {
        get().fetchUsers();
        return true;
      }
      set({ error: response.error || 'Failed to create user' });
      return false;
    } catch (error: any) {
      set({ error: error.message });
      return false;
    }
  },

  updateUser: async (id, data) => {
    set({ error: null });

    try {
      const response = await api.put(`/api/users/${id}`, data);

      if (response.success) {
        get().fetchUsers();
        return true;
      }
      set({ error: response.error || 'Failed to update user' });
      return false;
    } catch (error: any) {
      set({ error: error.message });
      return false;
    }
  },

  deleteUser: async (id) => {
    set({ error: null });

    try {
      const response = await api.delete(`/api/users/${id}`);

      if (response.success) {
        get().fetchUsers();
        return true;
      }
      set({ error: response.error || 'Failed to delete user' });
      return false;
    } catch (error: any) {
      set({ error: error.message });
      return false;
    }
  },

  toggleUserEnabled: async (id) => {
    set({ error: null });

    try {
      const response = await api.post(`/api/users/${id}/toggle-enabled`);

      if (response.success) {
        get().fetchUsers();
        return true;
      }
      set({ error: response.error || 'Failed to toggle user status' });
      return false;
    } catch (error: any) {
      set({ error: error.message });
      return false;
    }
  },

  resetPassword: async (id, newPassword) => {
    set({ error: null });

    try {
      const response = await api.post(`/api/users/${id}/reset-password`, { newPassword });

      if (response.success) {
        return true;
      }
      set({ error: response.error || 'Failed to reset password' });
      return false;
    } catch (error: any) {
      set({ error: error.message });
      return false;
    }
  },
}));
