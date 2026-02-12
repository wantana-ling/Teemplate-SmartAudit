import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '../services/api';

export interface User {
  id: string;
  username: string;
  display_name: string;
  role: 'super_admin' | 'admin' | 'auditor' | 'client';
  avatar_color: string;
  enabled: boolean;
}

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  signingIn: boolean;
  error: string | null;

  // Actions
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => void;
  initialize: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      loading: false,
      signingIn: false,
      error: null,

      signIn: async (username: string, password: string) => {
        try {
          set({ signingIn: true, error: null });

          const response = await api.login(username, password);

          if (!response.success || !response.data) {
            throw new Error(response.error || 'Login failed');
          }

          const { token, user } = response.data;

          // Check if user has client role
          if (user.role !== 'client') {
            throw new Error('Access denied. This application is for clients only.');
          }

          // Check if user is enabled
          if (!user.enabled) {
            throw new Error('Your account has been disabled. Please contact an administrator.');
          }

          api.setToken(token);

          set({
            user,
            token,
            signingIn: false,
          });
        } catch (error: any) {
          set({
            error: error.message,
            signingIn: false,
          });
          throw error;
        }
      },

      signOut: () => {
        api.setToken(null);
        set({
          user: null,
          token: null,
          error: null,
        });
      },

      initialize: async () => {
        try {
          set({ loading: true });

          const token = get().token;

          if (!token) {
            set({ loading: false });
            return;
          }

          // Set token for API calls
          api.setToken(token);

          // Verify token is still valid
          const response = await api.getMe();

          if (response.success && response.data) {
            // Check if user is still a client and enabled
            if (response.data.role !== 'client') {
              throw new Error('Access denied');
            }
            if (!response.data.enabled) {
              throw new Error('Account disabled');
            }

            set({
              user: response.data,
              loading: false,
            });
          } else {
            // Token invalid, clear state
            api.setToken(null);
            set({
              user: null,
              token: null,
              loading: false,
            });
          }
        } catch (error: any) {
          console.error('Auth initialization failed:', error);
          api.setToken(null);
          set({
            user: null,
            token: null,
            error: error.message,
            loading: false,
          });
        }
      },
    }),
    {
      name: 'client-auth',
      partialize: (state) => ({ token: state.token }),
    }
  )
);
