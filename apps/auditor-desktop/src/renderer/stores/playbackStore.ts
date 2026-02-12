import { create } from 'zustand';
import { Session } from './sessionStore';

interface PlaybackState {
  isOpen: boolean;
  session: Session | null;
  recordingUrl: string | null;
  openPlayback: (session: Session, recordingUrl: string) => void;
  closePlayback: () => void;
}

export const usePlaybackStore = create<PlaybackState>((set) => ({
  isOpen: false,
  session: null,
  recordingUrl: null,
  openPlayback: (session, recordingUrl) => set({ isOpen: true, session, recordingUrl }),
  closePlayback: () => set({ isOpen: false, session: null, recordingUrl: null }),
}));
