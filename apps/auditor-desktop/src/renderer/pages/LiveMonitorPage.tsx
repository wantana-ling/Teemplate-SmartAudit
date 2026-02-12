import { useEffect, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useSessionStore, Session } from '../stores/sessionStore';
import { format } from 'date-fns';
import { io, Socket } from 'socket.io-client';
import LiveStreamViewer from '../components/LiveStreamViewer';
import { api } from '../services/api';
import type { BanDuration } from '@smartaiaudit/shared';

interface RiskAlert {
  id: string;
  sessionId: string;
  level: 'low' | 'medium' | 'high' | 'critical';
  pattern: string;
  message: string;
  matchedText?: string;
  timestamp: number;
}

interface TerminateModalState {
  isOpen: boolean;
  session: Session | null;
  action: 'kick' | 'ban';
  banDuration: BanDuration;
  banReason: string;
  isLoading: boolean;
}

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8080';

export default function LiveMonitorPage() {
  const location = useLocation();
  const { activeSessions, fetchActiveSessions, terminateSession } = useSessionStore();
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);

  // Auto-select session from navigation state
  useEffect(() => {
    const state = location.state as { selectedSessionId?: string } | null;
    if (state?.selectedSessionId && activeSessions.length > 0) {
      const session = activeSessions.find(s => s.id === state.selectedSessionId);
      if (session) {
        setSelectedSession(session);
        // Clear the state so refreshing doesn't re-select
        window.history.replaceState({}, document.title);
      }
    }
  }, [location.state, activeSessions]);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [riskAlerts, setRiskAlerts] = useState<RiskAlert[]>([]);
  const [sessionUpdates, setSessionUpdates] = useState<Map<string, any>>(new Map());
  const [terminateModal, setTerminateModal] = useState<TerminateModalState>({
    isOpen: false,
    session: null,
    action: 'kick',
    banDuration: '24h',
    banReason: '',
    isLoading: false,
  });
  const [alertsCollapsed, setAlertsCollapsed] = useState(true);

  // Socket.IO connection
  useEffect(() => {
    const newSocket = io(BACKEND_URL, {
      path: '/socket.io/',
      transports: ['polling'], // Use polling only to avoid WebSocket conflict with guacamole-lite
      upgrade: false,
    });

    newSocket.on('risk-alert', (data: { sessionId: string; alerts: RiskAlert[]; timestamp: number }) => {
      setRiskAlerts((prev) => {
        const newAlerts = data.alerts.map((alert, idx) => ({
          ...alert,
          id: `${data.sessionId}-${data.timestamp}-${idx}`,
          sessionId: data.sessionId,
          timestamp: data.timestamp,
        }));
        // Deduplicate by ID to prevent duplicate alerts
        const existingIds = new Set(prev.map(a => a.id));
        const uniqueNewAlerts = newAlerts.filter(a => !existingIds.has(a.id));
        // Keep only last 50 alerts
        return [...uniqueNewAlerts, ...prev].slice(0, 50);
      });
    });

    newSocket.on('session-update', (data: any) => {
      setSessionUpdates((prev) => {
        const updated = new Map(prev);
        updated.set(data.sessionId, { ...updated.get(data.sessionId), ...data });
        return updated;
      });
    });

    newSocket.on('session-started', () => {
      fetchActiveSessions();
    });

    newSocket.on('session-ended', () => {
      fetchActiveSessions();
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [fetchActiveSessions]);

  // Note: LiveStreamViewer handles watch-session, so we don't need to emit it here

  useEffect(() => {
    fetchActiveSessions();
    const interval = setInterval(fetchActiveSessions, 5000);
    return () => clearInterval(interval);
  }, [fetchActiveSessions]);

  const dismissAlert = useCallback((alertId: string) => {
    setRiskAlerts((prev) => prev.filter((a) => a.id !== alertId));
  }, []);

  const getSessionWithUpdates = useCallback((session: Session) => {
    const updates = sessionUpdates.get(session.id);
    if (updates) {
      return {
        ...session,
        keystroke_count: updates.keystrokeCount ?? session.keystroke_count,
        risk_level: updates.riskLevel ?? updates.risk_level ?? session.risk_level,
      };
    }
    return session;
  }, [sessionUpdates]);

  const openTerminateModal = (session: Session) => {
    setTerminateModal({
      isOpen: true,
      session,
      action: 'kick',
      banDuration: '24h',
      banReason: '',
      isLoading: false,
    });
  };

  const closeTerminateModal = () => {
    setTerminateModal({
      isOpen: false,
      session: null,
      action: 'kick',
      banDuration: '24h',
      banReason: '',
      isLoading: false,
    });
  };

  const handleTerminateAction = async () => {
    const { session, action, banDuration, banReason } = terminateModal;
    if (!session) return;

    // Validate ban reason if banning
    if (action !== 'kick' && !banReason.trim()) {
      alert('Please provide a reason for the ban');
      return;
    }

    setTerminateModal((prev) => ({ ...prev, isLoading: true }));

    try {
      // First terminate the session
      if (socket?.connected) {
        socket.emit('terminate-session', session.id);
      }

      await terminateSession(session.id);

      // If banning, create the ban
      if (action === 'ban') {
        const userId = session.user_id || session.client_user_id;
        if (userId) {
          const banResponse = await api.post('/api/bans', {
            userId,
            reason: banReason.trim(),
            duration: banDuration,
            sessionId: session.id,
          });

          if (!banResponse.success) {
            console.error('[Ban] Failed to create ban:', banResponse.error);
            alert(`Session terminated, but failed to create ban: ${banResponse.error}`);
          }
        }
      }

      setSelectedSession(null);
      closeTerminateModal();
    } catch (error: any) {
      console.error('[Terminate] Error:', error);
      alert(`Failed to terminate session: ${error.message}`);
    } finally {
      setTerminateModal((prev) => ({ ...prev, isLoading: false }));
    }
  };

  const formatDuration = (startedAt: string) => {
    const start = new Date(startedAt);
    const now = new Date();
    const diff = Math.floor((now.getTime() - start.getTime()) / 1000);

    const hours = Math.floor(diff / 3600);
    const minutes = Math.floor((diff % 3600) / 60);
    const seconds = diff % 60;

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const getRiskLevelColor = (level: string) => {
    switch (level) {
      case 'critical': return 'bg-red-900/50 text-red-300 border-red-700';
      case 'high': return 'bg-orange-900/50 text-orange-300 border-orange-700';
      case 'medium': return 'bg-yellow-900/50 text-yellow-300 border-yellow-700';
      default: return 'bg-blue-900/50 text-blue-300 border-blue-700';
    }
  };

  const getRiskLevelIcon = (level: string) => {
    switch (level) {
      case 'critical':
      case 'high':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        );
      default:
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
    }
  };

  const sessionAlerts = selectedSession
    ? riskAlerts.filter(a => a.sessionId === selectedSession.id)
    : [];

  const highPriorityAlerts = riskAlerts.filter(a => ['critical', 'high'].includes(a.level));

  return (
    <div className="space-y-4">
      {/* Compact Status Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${socket?.connected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></div>
            <span className={`text-sm font-medium ${socket?.connected ? 'text-emerald-400' : 'text-red-400'}`}>
              {socket?.connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          <span className="text-slate-600">|</span>
          <span className="text-sm text-slate-500">Auto-refresh 5s</span>
        </div>

        {/* Collapsible Alert Badge */}
        {highPriorityAlerts.length > 0 && (
          <button
            onClick={() => setAlertsCollapsed(!alertsCollapsed)}
            className="flex items-center gap-2 px-3 py-1.5 bg-red-900/40 border border-red-700/50 rounded-lg hover:bg-red-900/60 transition-colors"
          >
            <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="text-sm font-medium text-red-400">{highPriorityAlerts.length} Alert{highPriorityAlerts.length > 1 ? 's' : ''}</span>
            <svg className={`w-4 h-4 text-red-400 transition-transform ${alertsCollapsed ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        )}
      </div>

      {/* Expandable Alerts Panel */}
      {highPriorityAlerts.length > 0 && !alertsCollapsed && (
        <div className="bg-red-900/20 border border-red-700/50 rounded-xl p-3 animate-fade-in">
          <div className="space-y-2 max-h-32 overflow-y-auto">
            {highPriorityAlerts.slice(0, 5).map((alert) => (
              <div key={alert.id} className="flex items-center justify-between bg-slate-800/80 rounded-lg p-2 border border-red-700/30">
                <div className="flex items-center gap-2">
                  <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded uppercase ${
                    alert.level === 'critical' ? 'bg-red-600 text-white' : 'bg-orange-500 text-white'
                  }`}>
                    {alert.level}
                  </span>
                  <span className="text-sm text-slate-200">{alert.message}</span>
                  <span className="text-xs text-slate-500">{alert.sessionId.slice(0, 8)}...</span>
                </div>
                <button onClick={() => dismissAlert(alert.id)} className="text-slate-500 hover:text-slate-300 p-1">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeSessions.length === 0 ? (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-16 text-center">
          <div className="w-20 h-20 mx-auto bg-slate-700/30 rounded-full flex items-center justify-center mb-4">
            <svg className="w-10 h-10 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-slate-200 mb-2">No Active Sessions</h2>
          <p className="text-slate-500 text-sm">Sessions will appear here when users connect to remote servers</p>
          <div className="flex items-center justify-center gap-2 mt-4 text-sm text-slate-600">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
            <span>Listening for connections...</span>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Sessions List */}
          <div className="lg:col-span-1 space-y-3">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">
              Active Sessions ({activeSessions.length})
            </h2>
            <div className="space-y-2">
              {activeSessions.map((session) => {
                const updatedSession = getSessionWithUpdates(session);
                const alertCount = riskAlerts.filter(a => a.sessionId === session.id).length;
                const hasHighAlert = riskAlerts.some(a => a.sessionId === session.id && ['critical', 'high'].includes(a.level));
                const riskLevel = updatedSession.risk_level || 'low';
                const isSelected = selectedSession?.id === session.id;

                // Risk-level border color
                const borderColor = riskLevel === 'critical' ? 'border-l-red-500' :
                                   riskLevel === 'high' ? 'border-l-orange-500' :
                                   riskLevel === 'medium' ? 'border-l-amber-500' :
                                   'border-l-emerald-500';

                return (
                  <div
                    key={session.id}
                    onClick={() => setSelectedSession(session)}
                    className={`bg-slate-800/80 rounded-xl border-l-4 ${borderColor} p-3 cursor-pointer transition-all card-hover ${
                      isSelected
                        ? 'ring-2 ring-blue-500 bg-slate-700/80'
                        : hasHighAlert
                        ? 'hover:bg-slate-700/80 shadow-[0_0_12px_rgba(239,68,68,0.15)]'
                        : 'hover:bg-slate-700/80'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-100 text-sm">
                          {session.servers?.name || session.server_name || session.servers?.host || session.server_host || 'Remote Session'}
                        </span>
                        {alertCount > 0 && (
                          <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full ${
                            hasHighAlert ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'
                          }`}>
                            {alertCount}
                          </span>
                        )}
                      </div>
                      <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded uppercase ${
                        (session.servers?.protocol || session.server_protocol) === 'ssh' ? 'bg-emerald-500/20 text-emerald-400' :
                        (session.servers?.protocol || session.server_protocol) === 'rdp' ? 'bg-blue-500/20 text-blue-400' :
                        'bg-violet-500/20 text-violet-400'
                      }`}>
                        {session.servers?.protocol || session.server_protocol || 'SSH'}
                      </span>
                    </div>
                    {/* User info */}
                    <div className="flex items-center gap-1.5 mb-2">
                      <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      <span className="text-xs text-slate-400">
                        {session.user?.display_name || session.user?.username || 'Unknown User'}
                      </span>
                      <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-[11px]">
                      <div>
                        <p className="text-slate-500">Duration</p>
                        <p className="text-slate-300 font-medium">{formatDuration(session.started_at)}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Keys</p>
                        <p className="text-slate-300 font-medium">{updatedSession.keystroke_count}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Risk</p>
                        <p className={`font-medium capitalize ${
                          riskLevel === 'critical' ? 'text-red-400' :
                          riskLevel === 'high' ? 'text-orange-400' :
                          riskLevel === 'medium' ? 'text-amber-400' :
                          'text-slate-300'
                        }`}>{riskLevel}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Session Details */}
          <div className="lg:col-span-2">
            {selectedSession ? (
              <div className="bg-slate-800 rounded-xl shadow-lg shadow-black/20 overflow-hidden">
                {/* Integrated Terminal Header */}
                <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white px-4 py-3 flex items-center justify-between border-b border-slate-700">
                  <div className="flex items-center gap-4">
                    {/* Protocol badge */}
                    <div className={`px-2 py-1 text-[10px] font-bold rounded uppercase ${
                      selectedSession.servers?.protocol === 'ssh' ? 'bg-emerald-600' :
                      selectedSession.servers?.protocol === 'rdp' ? 'bg-blue-600' :
                      'bg-violet-600'
                    }`}>
                      {selectedSession.servers?.protocol || 'SSH'}
                    </div>
                    {/* Server & User info */}
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-sm">{selectedSession.servers?.name || selectedSession.servers?.host || 'Remote Server'}</h3>
                        <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        <span>{selectedSession.user?.display_name || selectedSession.user?.username || 'Unknown User'}</span>
                        <span className="text-slate-600">|</span>
                        <span className="text-slate-500">{selectedSession.id.slice(0, 8)}...</span>
                      </div>
                    </div>
                  </div>
                  {/* Stats in header */}
                  <div className="flex items-center gap-4">
                    <div className="text-right hidden md:block">
                      <p className="text-lg font-bold text-slate-100 font-mono">{formatDuration(selectedSession.started_at)}</p>
                      <p className="text-[10px] text-slate-500 uppercase">Duration</p>
                    </div>
                    <div className="text-right hidden md:block">
                      <p className="text-lg font-bold text-slate-100">{getSessionWithUpdates(selectedSession).keystroke_count}</p>
                      <p className="text-[10px] text-slate-500 uppercase">Keys</p>
                    </div>
                    <div className="text-right hidden lg:block">
                      {(() => {
                        const updatedSession = getSessionWithUpdates(selectedSession);
                        return (
                          <>
                            <p className={`text-lg font-bold capitalize ${
                              updatedSession.risk_level === 'critical' ? 'text-red-400' :
                              updatedSession.risk_level === 'high' ? 'text-orange-400' :
                              updatedSession.risk_level === 'medium' ? 'text-amber-400' :
                              'text-emerald-400'
                            }`}>
                              {updatedSession.risk_level || 'Low'}
                            </p>
                            <p className="text-[10px] text-slate-500 uppercase">Risk</p>
                          </>
                        );
                      })()}
                    </div>
                    {/* Terminate button with glow */}
                    <button
                      onClick={() => openTerminateModal(selectedSession)}
                      className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-500 transition-all hover:shadow-[0_0_20px_rgba(239,68,68,0.4)] flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                      </svg>
                      <span className="hidden sm:inline">Terminate</span>
                    </button>
                  </div>
                </div>

                {/* Live Stream Viewer */}
                <div className="aspect-video bg-gray-950">
                  <LiveStreamViewer
                    socket={socket}
                    sessionId={selectedSession.id}
                    isConnected={socket?.connected ?? false}
                  />
                </div>

                {/* Session Risk Alerts - Compact */}
                {sessionAlerts.length > 0 && (
                  <div className="p-3 border-t border-slate-700 bg-slate-900/50">
                    <h4 className="font-medium text-slate-300 mb-2 flex items-center gap-2 text-sm">
                      <svg className="w-4 h-4 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      Alerts ({sessionAlerts.length})
                    </h4>
                    <div className="space-y-1.5 max-h-32 overflow-y-auto">
                      {sessionAlerts.map((alert) => (
                        <div
                          key={alert.id}
                          className={`rounded-lg p-2 border-l-2 bg-slate-800/50 ${
                            alert.level === 'critical' ? 'border-l-red-500' :
                            alert.level === 'high' ? 'border-l-orange-500' :
                            alert.level === 'medium' ? 'border-l-amber-500' :
                            'border-l-blue-500'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded uppercase flex-shrink-0 ${
                                alert.level === 'critical' ? 'bg-red-600 text-white' :
                                alert.level === 'high' ? 'bg-orange-500 text-white' :
                                alert.level === 'medium' ? 'bg-amber-500 text-white' :
                                'bg-blue-500 text-white'
                              }`}>
                                {alert.level}
                              </span>
                              <span className="text-xs text-slate-300 truncate">{alert.message}</span>
                              {alert.matchedText && (
                                <code className="text-[10px] text-slate-500 bg-slate-900 px-1 rounded hidden sm:inline">
                                  {alert.matchedText}
                                </code>
                              )}
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className="text-[10px] text-slate-500">
                                {format(new Date(alert.timestamp), 'HH:mm:ss')}
                              </span>
                              <button onClick={() => dismissAlert(alert.id)} className="text-slate-600 hover:text-slate-400 p-0.5">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 border-dashed p-12 text-center">
                <div className="w-16 h-16 mx-auto bg-slate-700/50 rounded-full flex items-center justify-center mb-4">
                  <svg className="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <p className="text-slate-400 font-medium">Select a session to monitor</p>
                <p className="text-slate-500 text-sm mt-1">Click on any active session from the list</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Terminate/Ban Modal */}
      {terminateModal.isOpen && terminateModal.session && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-800 rounded-xl shadow-xl max-w-md w-full mx-4 overflow-hidden border border-slate-700">
            <div className="bg-red-600 text-white p-4">
              <h3 className="text-lg font-semibold">Terminate Session</h3>
              <p className="text-sm text-red-100">
                {terminateModal.session.servers?.name || terminateModal.session.server_name || terminateModal.session.servers?.host || terminateModal.session.server_host}
              </p>
            </div>

            <div className="p-6 space-y-4">
              {/* User Info */}
              <div className="bg-slate-700 rounded-lg p-3">
                <p className="text-sm text-slate-400">User</p>
                <p className="font-medium text-slate-100">
                  {terminateModal.session.user?.display_name ||
                   terminateModal.session.user?.username ||
                   'Unknown User'}
                </p>
              </div>

              {/* Action Selection */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Action</label>
                <div className="space-y-2">
                  <label className="flex items-center gap-3 p-3 border border-slate-600 rounded-lg cursor-pointer hover:bg-slate-700 transition-colors">
                    <input
                      type="radio"
                      name="terminateAction"
                      value="kick"
                      checked={terminateModal.action === 'kick'}
                      onChange={() => setTerminateModal((prev) => ({ ...prev, action: 'kick' }))}
                      className="w-4 h-4 text-primary-600"
                    />
                    <div>
                      <p className="font-medium text-slate-100">Kick (End Session Only)</p>
                      <p className="text-sm text-slate-400">Disconnect user without ban</p>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-3 border border-slate-600 rounded-lg cursor-pointer hover:bg-slate-700 transition-colors">
                    <input
                      type="radio"
                      name="terminateAction"
                      value="ban"
                      checked={terminateModal.action === 'ban'}
                      onChange={() => setTerminateModal((prev) => ({ ...prev, action: 'ban' }))}
                      className="w-4 h-4 text-red-600"
                    />
                    <div>
                      <p className="font-medium text-red-400">Global Ban</p>
                      <p className="text-sm text-slate-400">Ban from all servers</p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Ban Options (shown when banning) */}
              {terminateModal.action !== 'kick' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Ban Duration
                    </label>
                    <select
                      value={terminateModal.banDuration}
                      onChange={(e) =>
                        setTerminateModal((prev) => ({
                          ...prev,
                          banDuration: e.target.value as BanDuration,
                        }))
                      }
                      className="w-full px-3 py-2 border border-slate-600 bg-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    >
                      <option value="1h">1 Hour</option>
                      <option value="24h">24 Hours</option>
                      <option value="7d">7 Days</option>
                      <option value="30d">30 Days</option>
                      <option value="permanent">Permanent</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Reason <span className="text-red-400">*</span>
                    </label>
                    <textarea
                      value={terminateModal.banReason}
                      onChange={(e) =>
                        setTerminateModal((prev) => ({ ...prev, banReason: e.target.value }))
                      }
                      placeholder="Enter the reason for this ban..."
                      rows={3}
                      className="w-full px-3 py-2 border border-slate-600 bg-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 placeholder-slate-500"
                      required
                    />
                  </div>
                </>
              )}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 px-6 py-4 bg-slate-900 border-t border-slate-700">
              <button
                onClick={closeTerminateModal}
                disabled={terminateModal.isLoading}
                className="px-4 py-2 text-slate-300 border border-slate-600 rounded-lg hover:bg-slate-700 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleTerminateAction}
                disabled={terminateModal.isLoading || (terminateModal.action !== 'kick' && !terminateModal.banReason.trim())}
                className={`px-4 py-2 text-white rounded-lg disabled:opacity-50 flex items-center gap-2 ${
                  terminateModal.action === 'kick'
                    ? 'bg-yellow-600 hover:bg-yellow-700'
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {terminateModal.isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Processing...
                  </>
                ) : terminateModal.action === 'kick' ? (
                  'Kick User'
                ) : (
                  'Global Ban'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
