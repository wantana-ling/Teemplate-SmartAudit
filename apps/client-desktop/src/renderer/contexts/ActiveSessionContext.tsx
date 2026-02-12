import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface ActiveSessionData {
  sessionId: string;
  token: string;
  serverId: string;
  serverName: string;
}

interface ActiveSessionContextType {
  activeSession: ActiveSessionData | null;
  isSessionActive: boolean;
  startSession: (data: ActiveSessionData) => void;
  endSession: () => void;
}

const ActiveSessionContext = createContext<ActiveSessionContextType | null>(null);

export function ActiveSessionProvider({ children }: { children: ReactNode }) {
  const [activeSession, setActiveSession] = useState<ActiveSessionData | null>(null);

  const startSession = useCallback((data: ActiveSessionData) => {
    setActiveSession(data);
  }, []);

  const endSession = useCallback(() => {
    setActiveSession(null);
  }, []);

  return (
    <ActiveSessionContext.Provider
      value={{
        activeSession,
        isSessionActive: activeSession !== null,
        startSession,
        endSession,
      }}
    >
      {children}
    </ActiveSessionContext.Provider>
  );
}

export function useActiveSession() {
  const context = useContext(ActiveSessionContext);
  if (!context) {
    throw new Error('useActiveSession must be used within ActiveSessionProvider');
  }
  return context;
}
