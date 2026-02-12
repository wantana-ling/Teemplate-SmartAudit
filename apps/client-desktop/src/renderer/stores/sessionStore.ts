import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { api } from '../services/api';

export interface Session {
  id: string;
  server_id: string;
  client_user_id: string;
  status: 'connecting' | 'pending' | 'active' | 'disconnected' | 'error';
  started_at: string;
  ended_at?: string;
  recording_url?: string;
  keystroke_count?: number;
  mouse_event_count?: number;
  error_message?: string;
}

interface SessionState {
  currentSession: Session | null;
  sessions: Session[];
  loading: boolean;
  error: string | null;
  socket: Socket | null;

  // Actions
  setCurrentSession: (session: Session | null) => void;
  startSession: (serverId: string) => Promise<void>;
  endSession: (sessionId: string) => Promise<void>;
  fetchSessions: () => Promise<void>;
  connectToBackend: () => void;
  disconnectFromBackend: () => void;
}

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8080';

export const useSessionStore = create<SessionState>((set, get) => ({
  currentSession: null,
  sessions: [],
  loading: false,
  error: null,
  socket: null,

  setCurrentSession: (session: Session | null) => {
    set({ currentSession: session });
  },

  startSession: async (serverId: string) => {
    try {
      set({ loading: true, error: null });

      const response = await api.post<{ session: Session }>('/api/sessions', {
        serverId,
      });

      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to start session');
      }

      set({
        currentSession: response.data.session,
        loading: false,
      });
    } catch (error: any) {
      set({
        error: error.message,
        loading: false,
      });
      throw error;
    }
  },

  endSession: async (sessionId: string) => {
    try {
      set({ loading: true, error: null });

      const response = await api.post(`/api/sessions/${sessionId}/end`);

      if (!response.success) {
        throw new Error(response.error || 'Failed to end session');
      }

      set({
        currentSession: null,
        loading: false,
      });
    } catch (error: any) {
      set({
        error: error.message,
        loading: false,
      });
      throw error;
    }
  },

  fetchSessions: async () => {
    try {
      set({ loading: true, error: null });

      const response = await api.get<Session[]>('/api/sessions/my');

      if (!response.success) {
        throw new Error(response.error || 'Failed to fetch sessions');
      }

      set({
        sessions: response.data || [],
        loading: false,
      });
    } catch (error: any) {
      set({
        error: error.message,
        loading: false,
      });
    }
  },

  connectToBackend: () => {
    const socket = io(BACKEND_URL, {
      transports: ['websocket', 'polling'],
    });

    socket.on('session-update', (data: any) => {
      set((state) => {
        if (state.currentSession?.id === data.sessionId) {
          return {
            currentSession: {
              ...state.currentSession,
              keystroke_count: data.keystrokeCount ?? state.currentSession.keystroke_count,
              mouse_event_count: data.mouseEventCount ?? state.currentSession.mouse_event_count,
              status: data.status ?? state.currentSession.status,
            },
          };
        }
        return state;
      });
    });

    set({ socket });
  },

  disconnectFromBackend: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
      set({ socket: null });
    }
  },
}));
