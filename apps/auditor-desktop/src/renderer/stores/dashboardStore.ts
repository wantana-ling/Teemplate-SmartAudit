import { create } from 'zustand';
import { api } from '../services/api';

interface DashboardStats {
  activeSessions: number;
  totalUsers: number;
  totalServers: number;
  riskDistribution: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
  sessionsToday: number;
  sessionsThisWeek: number;
}

interface ActivityItem {
  id: string;
  type: 'session_start' | 'session_end' | 'alert' | 'analysis_complete';
  message: string;
  timestamp: string;
  userId?: string;
  userName?: string;
  serverId?: string;
  serverName?: string;
  sessionId?: string;
  riskLevel?: string;
}

interface DashboardState {
  stats: DashboardStats | null;
  activities: ActivityItem[];
  loading: boolean;
  error: string | null;
  fetchStats: () => Promise<void>;
  fetchActivities: () => Promise<void>;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  stats: null,
  activities: [],
  loading: false,
  error: null,

  fetchStats: async () => {
    set({ loading: true, error: null });

    try {
      const response = await api.getDashboardStats();

      if (response.success && response.data) {
        set({ stats: response.data as DashboardStats, loading: false });
      } else {
        set({ error: response.error || 'Failed to fetch stats', loading: false });
      }
    } catch (error: any) {
      set({ error: error.message, loading: false });
    }
  },

  fetchActivities: async () => {
    try {
      const response = await api.getActivityFeed(20);

      if (response.success && response.data) {
        set({ activities: response.data as ActivityItem[] });
      }
    } catch (error: any) {
      console.error('Failed to fetch activities:', error);
    }
  },
}));
