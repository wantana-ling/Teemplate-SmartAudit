import { create } from 'zustand';
import { api } from '../services/api';

export interface Server {
  id: string;
  name: string;
  host: string;
  port: number;
  protocol: 'ssh' | 'rdp' | 'vnc';
  description?: string;
  tags?: string[];
  inUse?: boolean;
  activeUser?: string;
}

export interface ServerGroup {
  id: string;
  name: string;
  color: string;
  description?: string;
}

export interface GroupedServers {
  group: ServerGroup;
  servers: Server[];
}

interface ServerState {
  servers: Server[];
  groupedServers: Record<string, GroupedServers>;
  loading: boolean;
  error: string | null;

  // Actions
  fetchServers: () => Promise<void>;
  testConnection: (server: Server) => Promise<boolean>;
}

export const useServerStore = create<ServerState>((set) => ({
  servers: [],
  groupedServers: {},
  loading: false,
  error: null,

  fetchServers: async () => {
    try {
      set({ loading: true, error: null });

      const response = await api.getServers();

      if (!response.success) {
        throw new Error(response.error || 'Failed to fetch servers');
      }

      // Handle new grouped response format
      const data = response.data as { servers?: Server[]; groupedByGroup?: Record<string, GroupedServers> } || {};
      const servers = data.servers || [];
      const groupedByGroup = data.groupedByGroup || {};

      set({
        servers,
        groupedServers: groupedByGroup,
        loading: false,
      });
    } catch (error: any) {
      set({
        error: error.message,
        loading: false,
      });
    }
  },

  testConnection: async (server) => {
    try {
      const response = await api.get(`/api/connections/${server.id}/test`);
      return response.success;
    } catch (error) {
      return false;
    }
  },
}));
