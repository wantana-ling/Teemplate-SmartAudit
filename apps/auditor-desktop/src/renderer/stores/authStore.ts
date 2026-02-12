import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '../services/api';

export interface User {
  id: string;
  username: string;
  display_name: string;
  email: string | null;
  role: 'super_admin' | 'admin' | 'auditor' | 'client';
  enabled: boolean;
  avatar_color: string;
  created_at: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  signingIn: boolean;
  error: string | null;
  setupRequired: boolean;
  initialize: () => Promise<void>;
  checkSetupStatus: () => Promise<boolean>;
  createSuperAdmin: (username: string, password: string, displayName: string) => Promise<boolean>;
  signIn: (username: string, password: string) => Promise<boolean>;
  signOut: () => void;
  changePassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      loading: true,
      signingIn: false,
      error: null,
      setupRequired: false,

      initialize: async () => {
        const { token } = get();

        if (!token) {
          // Check if setup is required
          const setupRequired = await get().checkSetupStatus();
          set({ loading: false, setupRequired });
          return;
        }

        // Validate existing token
        try {
          api.setToken(token);
          const response = await api.get('/api/auth/me');

          if (response.success && response.data) {
            set({ user: response.data, loading: false, error: null });
          } else {
            // Token invalid, clear it
            api.setToken(null);
            set({ user: null, token: null, loading: false, error: null });
          }
        } catch (error: any) {
          console.error('Auth initialization error:', error);
          api.setToken(null);
          set({ user: null, token: null, loading: false, error: null });
        }
      },

      checkSetupStatus: async () => {
        try {
          const response = await api.get('/api/auth/setup/status');
          return response.data?.setupRequired || false;
        } catch (error) {
          console.error('Failed to check setup status:', error);
          return false;
        }
      },

      createSuperAdmin: async (username: string, password: string, displayName: string) => {
        set({ loading: true, error: null });

        try {
          const response = await api.post('/api/auth/setup/create-admin', {
            username,
            password,
            displayName,
          });

          if (response.success) {
            set({ loading: false, setupRequired: false });
            return true;
          }

          set({ loading: false, error: response.error || 'Failed to create admin' });
          return false;
        } catch (error: any) {
          set({ loading: false, error: error.message });
          return false;
        }
      },

      signIn: async (username: string, password: string) => {
        set({ signingIn: true, error: null });

        try {
          const response = await api.post('/api/auth/login', {
            username,
            password,
          });

          if (response.success && response.data) {
            const { user, token } = response.data;

            // Verify user has auditor app access (not a client)
            if (user.role === 'client') {
              set({
                signingIn: false,
                error: 'Access denied. Client accounts cannot access the auditor app.',
              });
              return false;
            }

            api.setToken(token);
            set({ user, token, signingIn: false, error: null });
            return true;
          }

          set({ signingIn: false, error: response.error || 'Sign in failed' });
          return false;
        } catch (error: any) {
          set({ signingIn: false, error: error.message });
          return false;
        }
      },

      signOut: () => {
        api.setToken(null);
        set({ user: null, token: null, error: null });
      },

      changePassword: async (currentPassword: string, newPassword: string) => {
        set({ loading: true, error: null });

        try {
          const response = await api.post('/api/auth/change-password', {
            currentPassword,
            newPassword,
          });

          if (response.success) {
            set({ loading: false });
            return true;
          }

          set({ loading: false, error: response.error || 'Failed to change password' });
          return false;
        } catch (error: any) {
          set({ loading: false, error: error.message });
          return false;
        }
      },
    }),
    {
      name: 'auditor-auth',
      partialize: (state) => ({
        token: state.token,
      }),
    }
  )
);
