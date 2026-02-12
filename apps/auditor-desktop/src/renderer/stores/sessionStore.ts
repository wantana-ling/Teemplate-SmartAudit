import { create } from 'zustand';
import { api } from '../services/api';

// Session finding with MITRE technique mapping
export interface SessionFinding {
  id: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  evidence: string;
  mitreTactic?: string;
  mitreTechniqueId?: string;
  mitreTechniqueName?: string;
  timestamp?: string;
  commandRiskScore?: number;
}

// Indicators of Compromise
export interface Indicators {
  ipAddresses: string[];
  domains: string[];
  fileHashes: string[];
  urls: string[];
  userAccounts: string[];
}

export interface Session {
  id: string;
  server_id: string | null;
  client_user_id: string;
  user_id: string | null;
  status: 'active' | 'disconnected' | 'error';
  started_at: string;
  ended_at: string | null;
  keystroke_count: number;
  mouse_event_count: number;
  risk_level: 'low' | 'medium' | 'high' | 'critical' | null;
  ai_summary: string | null;
  ai_risk_factors: string[] | null;
  guac_recording_url: string | null;
  // Denormalized server info (survives server deletion)
  server_name: string | null;
  server_host: string | null;
  server_protocol: string | null;
  // Review tracking
  reviewed: boolean;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  // Tags
  tags: string[];
  // Behavioral flags (MITRE ATT&CK aligned)
  privilege_escalation?: boolean;
  data_exfiltration?: boolean;
  persistence?: boolean;
  lateral_movement?: boolean;
  credential_access?: boolean;
  defense_evasion?: boolean;
  // Detailed analysis
  indicators?: Indicators;
  findings?: SessionFinding[];
  // Related entities (null when server has been deleted)
  servers?: {
    id: string;
    name: string;
    host: string;
    protocol: string;
  } | null;
  user?: {
    id: string;
    email: string;
    username: string;
    display_name: string | null;
  };
  reviewer?: {
    id: string;
    email: string;
    username: string;
    display_name: string | null;
  };
}

interface SessionFilters {
  status?: string;
  userId?: string;
  serverId?: string;
  riskLevel?: string;
  reviewed?: boolean;
  tags?: string[];
  search?: string;
  flag?: string;
}

interface SessionState {
  sessions: Session[];
  activeSessions: Session[];
  selectedSession: Session | null;
  loading: boolean;
  error: string | null;
  filters: SessionFilters;
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
  fetchSessions: (filters?: SessionFilters) => Promise<void>;
  fetchActiveSessions: () => Promise<void>;
  fetchSession: (id: string) => Promise<void>;
  terminateSession: (id: string) => Promise<boolean>;
  setFilters: (filters: SessionFilters) => void;
  clearSelectedSession: () => void;
  // Review methods
  markReviewed: (sessionId: string, notes?: string) => Promise<boolean>;
  markUnreviewed: (sessionId: string) => Promise<boolean>;
  // Tag methods
  addTag: (sessionId: string, tag: string) => Promise<boolean>;
  removeTag: (sessionId: string, tag: string) => Promise<boolean>;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  activeSessions: [],
  selectedSession: null,
  loading: false,
  error: null,
  filters: {},
  pagination: {
    limit: 50,
    offset: 0,
    total: 0,
  },

  fetchSessions: async (filters?: SessionFilters) => {
    set({ loading: true, error: null });

    try {
      const currentFilters = filters || get().filters;
      const { pagination } = get();

      const response = await api.getSessions({
        ...currentFilters,
        limit: pagination.limit,
        offset: pagination.offset,
      });

      if (response.success && response.data) {
        set({
          sessions: response.data as Session[],
          loading: false,
          pagination: response.pagination || pagination,
        });
      } else {
        set({ error: response.error || 'Failed to fetch sessions', loading: false });
      }
    } catch (error: any) {
      set({ error: error.message, loading: false });
    }
  },

  fetchActiveSessions: async () => {
    try {
      const response = await api.getActiveSessions();

      if (response.success && response.data) {
        set({ activeSessions: response.data as Session[] });
      }
    } catch (error: any) {
      console.error('Failed to fetch active sessions:', error);
    }
  },

  fetchSession: async (id: string) => {
    set({ loading: true, error: null });

    try {
      const response = await api.getSession(id);

      if (response.success && response.data) {
        set({ selectedSession: response.data as Session, loading: false });
      } else {
        set({ error: response.error || 'Session not found', loading: false });
      }
    } catch (error: any) {
      set({ error: error.message, loading: false });
    }
  },

  terminateSession: async (id: string) => {
    try {
      const response = await api.terminateSession(id);

      if (response.success) {
        // Refresh sessions list
        get().fetchActiveSessions();
        return true;
      }
      return false;
    } catch (error: any) {
      console.error('Failed to terminate session:', error);
      return false;
    }
  },

  setFilters: (filters: SessionFilters) => {
    set({ filters, pagination: { ...get().pagination, offset: 0 } });
    get().fetchSessions(filters);
  },

  clearSelectedSession: () => {
    set({ selectedSession: null });
  },

  markReviewed: async (sessionId: string, notes?: string) => {
    try {
      const response = await api.markSessionReviewed(sessionId, notes);

      if (response.success && response.data) {
        const updatedSession = response.data as Session;

        // Update in sessions list
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId ? { ...s, ...updatedSession } : s
          ),
          selectedSession:
            state.selectedSession?.id === sessionId
              ? { ...state.selectedSession, ...updatedSession }
              : state.selectedSession,
        }));
        return true;
      }
      return false;
    } catch (error: any) {
      console.error('Failed to mark session as reviewed:', error);
      return false;
    }
  },

  markUnreviewed: async (sessionId: string) => {
    try {
      const response = await api.markSessionUnreviewed(sessionId);

      if (response.success && response.data) {
        const updatedSession = response.data as Session;

        // Update in sessions list
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId ? { ...s, ...updatedSession } : s
          ),
          selectedSession:
            state.selectedSession?.id === sessionId
              ? { ...state.selectedSession, ...updatedSession }
              : state.selectedSession,
        }));
        return true;
      }
      return false;
    } catch (error: any) {
      console.error('Failed to mark session as unreviewed:', error);
      return false;
    }
  },

  addTag: async (sessionId: string, tag: string) => {
    try {
      const response = await api.addSessionTag(sessionId, tag);

      if (response.success && response.data) {
        const { tags } = response.data as { tags: string[] };

        // Update in sessions list
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId ? { ...s, tags } : s
          ),
          selectedSession:
            state.selectedSession?.id === sessionId
              ? { ...state.selectedSession, tags }
              : state.selectedSession,
        }));
        return true;
      }
      return false;
    } catch (error: any) {
      console.error('Failed to add tag:', error);
      return false;
    }
  },

  removeTag: async (sessionId: string, tag: string) => {
    try {
      const response = await api.removeSessionTag(sessionId, tag);

      if (response.success && response.data) {
        const { tags } = response.data as { tags: string[] };

        // Update in sessions list
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId ? { ...s, tags } : s
          ),
          selectedSession:
            state.selectedSession?.id === sessionId
              ? { ...state.selectedSession, tags }
              : state.selectedSession,
        }));
        return true;
      }
      return false;
    } catch (error: any) {
      console.error('Failed to remove tag:', error);
      return false;
    }
  },
}));
