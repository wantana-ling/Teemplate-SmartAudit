import { create } from 'zustand';
import { api } from '../services/api';

export interface Server {
  id: string;
  name: string;
  host: string;
  port: number;
  protocol: 'ssh' | 'rdp' | 'vnc';
  username?: string;
  description?: string;
  enabled: boolean;
  created_at: string;
  active_sessions?: number;
}

interface ServerState {
  servers: Server[];
  loading: boolean;
  error: string | null;
  isUpdating: boolean; // Prevents fetch from overwriting optimistic updates
  fetchServers: (params?: { search?: string; status?: string }) => Promise<void>;
  createServer: (data: Omit<Server, 'id' | 'created_at' | 'enabled'> & { password?: string }) => Promise<boolean>;
  updateServer: (id: string, data: Partial<Server> & { password?: string }) => Promise<boolean>;
  deleteServer: (id: string) => Promise<boolean>;
}

export const useServerStore = create<ServerState>((set, get) => ({
  servers: [],
  loading: false,
  error: null,
  isUpdating: false,

  fetchServers: async (params) => {
    // Skip fetch if an update is in progress to prevent overwriting optimistic updates
    if (get().isUpdating) {
      return;
    }

    set({ loading: true, error: null });

    try {
      const response = await api.getServers(params);

      // Double-check isUpdating in case an update started during the fetch
      if (response.success && response.data && !get().isUpdating) {
        set({ servers: response.data as Server[], loading: false });
      } else if (!get().isUpdating) {
        set({ error: response.error || 'Failed to fetch servers', loading: false });
      } else {
        set({ loading: false });
      }
    } catch (error: any) {
      if (!get().isUpdating) {
        set({ error: error.message, loading: false });
      } else {
        set({ loading: false });
      }
    }
  },

  createServer: async (data) => {
    try {
      const response = await api.createServer(data);

      if (response.success) {
        get().fetchServers();
        return true;
      }
      set({ error: response.error || 'Failed to create server' });
      return false;
    } catch (error: any) {
      set({ error: error.message });
      return false;
    }
  },

  updateServer: async (id, data) => {
    // Optimistic update - update local state immediately
    const previousServers = get().servers;
    set({
      isUpdating: true,
      servers: previousServers.map(server =>
        server.id === id ? { ...server, ...data } : server
      ),
    });

    try {
      const response = await api.updateServer(id, data);

      if (response.success) {
        // Update complete, allow fetches again
        set({ isUpdating: false });
        return true;
      }
      // Revert on failure
      set({ servers: previousServers, error: response.error || 'Failed to update server', isUpdating: false });
      return false;
    } catch (error: any) {
      // Revert on error
      set({ servers: previousServers, error: error.message, isUpdating: false });
      return false;
    }
  },

  deleteServer: async (id) => {
    try {
      const response = await api.deleteServer(id);

      if (response.success) {
        get().fetchServers();
        return true;
      }
      set({ error: response.error || 'Failed to delete server' });
      return false;
    } catch (error: any) {
      set({ error: error.message });
      return false;
    }
  },
}));
