import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDashboardStore } from '../stores/dashboardStore';
import { useSessionStore } from '../stores/sessionStore';
import { usePlaybackStore } from '../stores/playbackStore';
import { formatDistanceToNow, format } from 'date-fns';
import { api } from '../services/api';

interface UserRiskProfile {
  user_id: string;
  total_sessions: number;
  high_risk_sessions: number;
  critical_sessions: number;
  privilege_escalation_count: number;
  data_exfiltration_count: number;
  persistence_count: number;
  lateral_movement_count: number;
  credential_access_count: number;
  defense_evasion_count: number;
  risk_score_7d: number;
  risk_score_30d: number;
  last_session_at: string | null;
  last_high_risk_at: string | null;
  users?: {
    id: string;
    email: string;
    username: string;
    display_name: string | null;
  };
}

interface ServerRiskProfile {
  server_id: string;
  total_sessions: number;
  high_risk_sessions: number;
  unique_users: number;
  risk_score_7d: number;
  risk_score_30d: number;
  last_session_at: string | null;
  servers?: {
    id: string;
    name: string;
    host: string;
    enabled?: boolean;
  };
}

interface BehavioralSummary {
  privilege_escalation: number;
  data_exfiltration: number;
  persistence: number;
  lateral_movement: number;
  credential_access: number;
  defense_evasion: number;
}

interface ActivityItem {
  id: string;
  type: 'alert' | 'session_end' | 'session_start' | 'review' | 'ban' | 'unban' | 'kick';
  level: 'critical' | 'high' | 'medium' | 'low' | 'info';
  message: string;
  timestamp: Date;
  sessionId?: string;
  serverName?: string;
}

// SVG Icon components for consistency
const Icons = {
  shield: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  ),
  arrowUp: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
    </svg>
  ),
  key: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
    </svg>
  ),
  eyeOff: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
    </svg>
  ),
  arrowsExpand: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
    </svg>
  ),
  upload: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
  ),
  link: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
  ),
  target: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
    </svg>
  ),
};

// Memoized MITRE tactic - stable per session based on id hash
const getMitreTactic = (session: any): string | null => {
  const tactics = ['Privilege Escalation', 'Credential Access', 'Defense Evasion', 'Data Exfiltration', 'Persistence', 'Lateral Movement'];
  if (session.risk_level === 'critical' || session.risk_level === 'high') {
    // Use session id to get consistent tactic
    const hash = session.id.split('').reduce((a: number, b: string) => a + b.charCodeAt(0), 0);
    return tactics[hash % tactics.length];
  }
  return null;
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const { stats, fetchStats } = useDashboardStore();
  const { activeSessions, sessions, fetchActiveSessions, fetchSessions } = useSessionStore();
  const { openPlayback } = usePlaybackStore();

  // Risk analytics state
  const [highRiskUsers, setHighRiskUsers] = useState<UserRiskProfile[]>([]);
  const [highRiskServers, setHighRiskServers] = useState<ServerRiskProfile[]>([]);
  const [behavioralSummary, setBehavioralSummary] = useState<BehavioralSummary | null>(null);
  const [riskLoading, setRiskLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);
  const [recentBans, setRecentBans] = useState<any[]>([]);
  const [priorityReviewSessions, setPriorityReviewSessions] = useState<any[]>([]);

  // Ban dialog state
  const [banDialogOpen, setBanDialogOpen] = useState(false);
  const [banTarget, setBanTarget] = useState<{ userId: string; sessionId: string; userName: string } | null>(null);
  const [banReason, setBanReason] = useState('');
  const [banDuration, setBanDuration] = useState<'1h' | '24h' | '7d' | '30d' | 'permanent'>('24h');
  const [banSubmitting, setBanSubmitting] = useState(false);

  // Freeze dialog state
  const [freezeDialogOpen, setFreezeDialogOpen] = useState(false);
  const [freezeTarget, setFreezeTarget] = useState<{ userId: string; serverId: string; sessionId: string; userName: string; serverName: string } | null>(null);
  const [freezeSubmitting, setFreezeSubmitting] = useState(false);

  // Modal states for "View All" popups
  const [riskUsersModalOpen, setRiskUsersModalOpen] = useState(false);
  const [riskUsersModalData, setRiskUsersModalData] = useState<UserRiskProfile[]>([]);
  const [riskUsersModalLoading, setRiskUsersModalLoading] = useState(false);

  const [riskServersModalOpen, setRiskServersModalOpen] = useState(false);
  const [riskServersModalData, setRiskServersModalData] = useState<ServerRiskProfile[]>([]);
  const [riskServersModalLoading, setRiskServersModalLoading] = useState(false);

  const [activityModalOpen, setActivityModalOpen] = useState(false);
  const [activityModalData, setActivityModalData] = useState<ActivityItem[]>([]);
  const [activityModalLoading, setActivityModalLoading] = useState(false);
  const [activityModalHasMore, setActivityModalHasMore] = useState(true);
  const [activityModalOffset, setActivityModalOffset] = useState(0);
  const activityModalRef = useRef<HTMLDivElement>(null);

  const [priorityReviewModalOpen, setPriorityReviewModalOpen] = useState(false);
  const [priorityReviewModalData, setPriorityReviewModalData] = useState<any[]>([]);
  const [priorityReviewModalLoading, setPriorityReviewModalLoading] = useState(false);

  // Initial data flag
  const initialLoadDone = useRef(false);

  const fetchRiskData = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setIsRefreshing(true);
    } else if (!initialLoadDone.current) {
      setRiskLoading(true);
    }

    try {
      const [usersRes, serversRes, behavioralRes, bansRes, priorityRes] = await Promise.all([
        api.getHighRiskUsers(5),
        api.getHighRiskServers(5),
        api.getBehavioralPatternSummary(),
        api.getRecentBans(10),
        api.getSessions({ status: 'disconnected', riskLevel: 'critical,high', reviewed: false, limit: 5 }),
      ]);

      if (usersRes.success && usersRes.data) {
        setHighRiskUsers(usersRes.data as UserRiskProfile[]);
      }
      if (serversRes.success && serversRes.data) {
        setHighRiskServers(serversRes.data as ServerRiskProfile[]);
      }
      if (behavioralRes.success && behavioralRes.data) {
        setBehavioralSummary(behavioralRes.data as BehavioralSummary);
      }
      if (bansRes.success && bansRes.data) {
        setRecentBans(bansRes.data as any[]);
      }
      if (priorityRes.success && priorityRes.data) {
        setPriorityReviewSessions(priorityRes.data as any[]);
      }
    } catch (error) {
      console.error('Failed to fetch risk analytics:', error);
    } finally {
      setRiskLoading(false);
      setIsRefreshing(false);
      initialLoadDone.current = true;
    }
  }, []);

  // Modal handlers
  const openRiskUsersModal = useCallback(async () => {
    setRiskUsersModalOpen(true);
    setRiskUsersModalLoading(true);
    try {
      const res = await api.getHighRiskUsers(50);
      if (res.success && res.data) {
        setRiskUsersModalData(res.data as UserRiskProfile[]);
      }
    } catch (error) {
      console.error('Failed to fetch risk users:', error);
    } finally {
      setRiskUsersModalLoading(false);
    }
  }, []);

  const openRiskServersModal = useCallback(async () => {
    setRiskServersModalOpen(true);
    setRiskServersModalLoading(true);
    try {
      const res = await api.getHighRiskServers(50);
      if (res.success && res.data) {
        setRiskServersModalData(res.data as ServerRiskProfile[]);
      }
    } catch (error) {
      console.error('Failed to fetch risk servers:', error);
    } finally {
      setRiskServersModalLoading(false);
    }
  }, []);

  const openPriorityReviewModal = useCallback(async () => {
    setPriorityReviewModalOpen(true);
    setPriorityReviewModalLoading(true);
    try {
      const res = await api.getSessions({ status: 'disconnected', riskLevel: 'critical,high', reviewed: false, limit: 50 });
      const endedSessions = res.success && res.data ? res.data as any[] : [];
      // Include active critical/high sessions (from store, already loaded)
      const activeHighRisk = activeSessions.filter(s => s.risk_level === 'critical' || s.risk_level === 'high');
      // Active sessions first, then ended sessions
      setPriorityReviewModalData([
        ...activeHighRisk.map((s: any) => ({ ...s, _isActive: true })),
        ...endedSessions.map((s: any) => ({ ...s, _isActive: false })),
      ]);
    } catch (error) {
      console.error('Failed to fetch priority review sessions:', error);
    } finally {
      setPriorityReviewModalLoading(false);
    }
  }, [activeSessions]);

  const openActivityModal = useCallback(async () => {
    setActivityModalOpen(true);
    setActivityModalLoading(true);
    setActivityModalOffset(0);
    setActivityModalHasMore(true);
    try {
      const [res, bansRes] = await Promise.all([
        api.getSessions({ status: 'disconnected', limit: 20, offset: 0 }),
        api.getRecentBans(20),
      ]);
      const sessionsData = res.success && res.data ? res.data as any[] : [];
      const bansData = bansRes.success && bansRes.data ? bansRes.data as any[] : [];
      const activities = generateActivityFromSessions(sessionsData, [], bansData);
      setActivityModalData(activities);
      setActivityModalOffset(20);
      setActivityModalHasMore(sessionsData.length === 20);
    } catch (error) {
      console.error('Failed to fetch activity:', error);
    } finally {
      setActivityModalLoading(false);
    }
  }, []);

  const loadMoreActivity = useCallback(async () => {
    if (activityModalLoading || !activityModalHasMore) return;
    setActivityModalLoading(true);
    try {
      const res = await api.getSessions({ status: 'disconnected', limit: 20, offset: activityModalOffset });
      if (res.success && res.data) {
        const sessionsData = res.data as any[];
        const newActivities = generateActivityFromSessions(sessionsData, [], []);
        setActivityModalData(prev => [...prev, ...newActivities]);
        setActivityModalOffset(prev => prev + 20);
        setActivityModalHasMore(sessionsData.length === 20);
      }
    } catch (error) {
      console.error('Failed to fetch more activity:', error);
    } finally {
      setActivityModalLoading(false);
    }
  }, [activityModalLoading, activityModalHasMore, activityModalOffset]);

  // Helper to generate activity items from sessions, active sessions, and bans
  const generateActivityFromSessions = (sessionsData: any[], activeSess: any[], bans: any[]): ActivityItem[] => {
    const activities: ActivityItem[] = [];
    const getClientName = (session: any) => {
      return session.user?.display_name || session.user?.username || session.user?.email?.split('@')[0] || 'Unknown';
    };

    sessionsData.forEach((session) => {
      const clientName = getClientName(session);
      const serverName = session.servers?.name || session.server_name || 'Unknown Server';

      if (session.risk_level === 'critical' || session.risk_level === 'high') {
        activities.push({
          id: `alert-${session.id}`,
          type: 'alert',
          level: session.risk_level as 'critical' | 'high',
          message: `${session.risk_level.toUpperCase()} risk detected - ${clientName} on ${serverName}`,
          timestamp: new Date(session.ended_at || session.started_at),
          sessionId: session.id,
          serverName,
        });
      }

      activities.push({
        id: `session-${session.id}`,
        type: 'session_end',
        level: session.risk_level === 'critical' ? 'critical' : session.risk_level === 'high' ? 'high' : 'info',
        message: `Session ended on ${serverName} by ${clientName}`,
        timestamp: new Date(session.ended_at || session.started_at),
        sessionId: session.id,
        serverName,
      });
    });

    // Add active sessions as "session started"
    activeSess.forEach((session) => {
      const clientName = getClientName(session);
      const serverName = session.servers?.name || session.server_name || 'Unknown Server';
      activities.push({
        id: `start-${session.id}`,
        type: 'session_start',
        level: session.risk_level === 'critical' ? 'critical' : session.risk_level === 'high' ? 'high' : 'info',
        message: `Session started on ${serverName} by ${clientName}`,
        timestamp: new Date(session.started_at),
        sessionId: session.id,
        serverName,
      });
    });

    // Add ban and unban events
    bans.forEach((ban) => {
      const bannedUserName = ban.users?.display_name || ban.users?.username || ban.users?.email?.split('@')[0] || 'Unknown';
      const serverName = ban.servers?.name;

      activities.push({
        id: `ban-${ban.id}`,
        type: 'ban',
        level: 'critical',
        message: serverName
          ? `${bannedUserName} banned from ${serverName}`
          : `${bannedUserName} banned globally`,
        timestamp: new Date(ban.banned_at || ban.created_at),
        sessionId: ban.session_id,
        serverName,
      });

      if (ban.lifted_at) {
        activities.push({
          id: `unban-${ban.id}`,
          type: 'unban',
          level: 'info',
          message: serverName
            ? `${bannedUserName} unbanned from ${serverName}`
            : `${bannedUserName} unbanned`,
          timestamp: new Date(ban.lifted_at),
          sessionId: ban.session_id,
          serverName,
        });
      }
    });

    return activities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  };

  // Infinite scroll handler for activity modal
  const handleActivityScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    const bottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 100;
    if (bottom && !activityModalLoading && activityModalHasMore) {
      loadMoreActivity();
    }
  }, [loadMoreActivity, activityModalLoading, activityModalHasMore]);

  // Initial load - stagger fetches to reduce initial load time
  useEffect(() => {
    // Priority fetches first (fast, critical for UI)
    fetchStats();
    fetchActiveSessions();

    // Secondary fetches (can be slightly delayed)
    const sessionsTimer = setTimeout(() => {
      fetchSessions({ status: 'disconnected' });
    }, 100);

    // Risk data last (heavier, less critical for initial view)
    const riskTimer = setTimeout(() => {
      fetchRiskData(false);
    }, 200);

    // Refresh interval - active sessions more frequently, risk data less frequently
    const activeInterval = setInterval(() => {
      fetchStats();
      fetchActiveSessions();
    }, 15000); // 15 seconds for active sessions

    const riskInterval = setInterval(() => {
      fetchRiskData(true);
    }, 60000); // 60 seconds for risk analytics (less frequent)

    return () => {
      clearTimeout(sessionsTimer);
      clearTimeout(riskTimer);
      clearInterval(activeInterval);
      clearInterval(riskInterval);
    };
  }, [fetchStats, fetchActiveSessions, fetchSessions, fetchRiskData]);

  // Generate activity feed from sessions, active sessions, and bans
  useEffect(() => {
    const activities = generateActivityFromSessions(sessions.slice(0, 10), activeSessions, recentBans);
    setRecentActivity(activities.slice(0, 8));
  }, [sessions, activeSessions, recentBans]);

  // Session actions
  const handlePlayback = async (session: any) => {
    try {
      const response = await api.get<{ signedUrl: string }>(`/api/sessions/${session.id}/recording-url`);
      if (response.success && response.data?.signedUrl) {
        openPlayback(session, response.data.signedUrl);
      } else {
        // Fallback: navigate to session page
        navigate(`/sessions/${session.id}?playback=true`);
      }
    } catch {
      navigate(`/sessions/${session.id}?playback=true`);
    }
  };

  // Ban user directly from risk users list (global ban only)
  const handleBanRiskUser = (riskUser: UserRiskProfile) => {
    setBanTarget({
      userId: riskUser.user_id,
      sessionId: '', // No session context
      userName: riskUser.users?.display_name || riskUser.users?.username || riskUser.users?.email?.split('@')[0] || 'Unknown User',
    });
    setBanReason('');
    setBanDuration('24h');
    setBanError(null);
    setBanDialogOpen(true);
  };

  // Freeze: ban user + disable server
  const handleFreeze = (session: any) => {
    setFreezeTarget({
      userId: session.user_id,
      serverId: session.server_id,
      sessionId: session.id,
      userName: session.user?.display_name || session.user?.username || session.user?.email?.split('@')[0] || 'Unknown',
      serverName: session.servers?.name || session.server_name || 'Unknown Server',
    });
    setFreezeDialogOpen(true);
  };

  const submitFreeze = async () => {
    if (!freezeTarget) return;
    setFreezeSubmitting(true);
    try {
      const reason = `Frozen via priority review: ${freezeTarget.userName} on ${freezeTarget.serverName}`;
      const response = await api.post('/api/bans/freeze', {
        userId: freezeTarget.userId,
        serverId: freezeTarget.serverId,
        reason,
        sessionId: freezeTarget.sessionId,
      });
      if (!response.success) {
        alert(response.error || 'Failed to freeze');
        return;
      }
      setFreezeDialogOpen(false);
      // Optimistically mark server as disabled and user as banned
      setServerEnabledStates(prev => new Map(prev).set(freezeTarget.serverId, false));
      // Refresh data to get updated ban list
      fetchSessions({ status: 'disconnected' });
      fetchRiskData(true);
      fetchActiveSessions();
    } catch (error: any) {
      console.error('Failed to freeze:', error);
      alert(error.message || 'Failed to freeze');
    } finally {
      setFreezeSubmitting(false);
    }
  };

  // Track server enabled states (for optimistic UI updates)
  const [serverEnabledStates, setServerEnabledStates] = useState<Map<string, boolean>>(new Map());

  // Toggle server enabled status
  const handleToggleServer = async (serverId: string, currentlyEnabled: boolean, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    // Optimistic update
    setServerEnabledStates(prev => new Map(prev).set(serverId, !currentlyEnabled));
    try {
      const response = await api.put(`/api/admin/servers/${serverId}`, { enabled: !currentlyEnabled });
      if (!response.success) {
        // Revert on failure
        setServerEnabledStates(prev => new Map(prev).set(serverId, currentlyEnabled));
      }
    } catch {
      // Revert on error
      setServerEnabledStates(prev => new Map(prev).set(serverId, currentlyEnabled));
    }
  };

  // Get effective enabled state (local override or from backend data)
  const getServerEnabled = (server: ServerRiskProfile): boolean => {
    if (serverEnabledStates.has(server.server_id)) {
      return serverEnabledStates.get(server.server_id)!;
    }
    return server.servers?.enabled !== false;
  };

  // Set of user IDs with active bans (for BANNED badge display)
  const bannedUserIds = useMemo(() => {
    const set = new Set<string>();
    for (const ban of recentBans) {
      if (!ban.lifted_at) set.add(ban.user_id);
    }
    return set;
  }, [recentBans]);

  const [banError, setBanError] = useState<string | null>(null);

  const submitBan = async () => {
    if (!banTarget || !banReason.trim()) return;
    setBanSubmitting(true);
    setBanError(null);
    try {
      const response = await api.createBan({
        userId: banTarget.userId,
        reason: banReason,
        duration: banDuration,
        sessionId: banTarget.sessionId,
      });
      if (!response.success) {
        setBanError(response.error || 'Failed to create ban');
        return;
      }
      setBanDialogOpen(false);
      // Refresh data
      fetchSessions({ status: 'disconnected' });
      fetchRiskData(true); // Refresh bans list
    } catch (error: any) {
      console.error('Failed to create ban:', error);
      setBanError(error.message || 'Failed to create ban');
    } finally {
      setBanSubmitting(false);
    }
  };

  // Computed values
  // sessionsNeedingReview from dedicated API fetch (not limited by store's 50-session window)
  const sessionsNeedingReview = priorityReviewSessions;

  const riskCounts = useMemo(() => {
    const critical = stats?.riskDistribution?.critical || 0;
    const high = stats?.riskDistribution?.high || 0;
    const medium = stats?.riskDistribution?.medium || 0;
    const low = stats?.riskDistribution?.low || 0;
    return { critical, high, medium, low, total: critical + high + medium + low };
  }, [stats]);

  // All unreviewed sessions (for the stat box)
  const unreviewedCount = useMemo(() => {
    return sessions.filter(s => !s.reviewed).length;
  }, [sessions]);

  // Accurate priority review count from backend stats (includes all unreviewed critical+high)
  const priorityReviewCount = riskCounts.critical + riskCounts.high;

  // Medium+high+critical unreviewed sessions (for the Review button in Threat Level bar)
  const priorityUnreviewedCount = useMemo(() => {
    return sessions.filter(s => !s.reviewed && (s.risk_level === 'critical' || s.risk_level === 'high' || s.risk_level === 'medium')).length;
  }, [sessions]);

  // Build a map of disabled server IDs from all available session data
  const disabledServerIds = useMemo(() => {
    const set = new Set<string>();
    // From high risk servers
    for (const s of highRiskServers) {
      if (s.servers?.enabled === false) set.add(s.server_id);
    }
    // From active sessions (server join includes enabled field)
    for (const s of activeSessions) {
      if ((s as any).servers?.enabled === false) set.add(s.server_id);
    }
    // From sessions needing review
    for (const s of sessionsNeedingReview) {
      if (s.servers?.enabled === false) set.add(s.server_id);
    }
    return set;
  }, [highRiskServers, activeSessions, sessionsNeedingReview]);

  // Helper: check if a specific server is disabled
  const isServerDisabled = useCallback((serverId: string): boolean => {
    // Optimistic local state takes priority
    if (serverEnabledStates.has(serverId)) {
      return !serverEnabledStates.get(serverId);
    }
    return disabledServerIds.has(serverId);
  }, [serverEnabledStates, disabledServerIds]);

  // Helper: check if a session is "frozen" (user banned + server disabled)
  const isSessionFrozen = useCallback((session: any): boolean => {
    if (!bannedUserIds.has(session.user_id)) return false;
    return isServerDisabled(session.server_id);
  }, [bannedUserIds, isServerDisabled]);

  // Weighted threat score calculation
  const { threatLevel, threatScore } = useMemo(() => {
    let score = 0;

    // Collect all priority sessions (active critical/high + unreviewed critical/high/medium)
    const activeHighRisk = activeSessions.filter(s => s.risk_level === 'critical' || s.risk_level === 'high');
    let totalPriority = activeHighRisk.length + sessionsNeedingReview.length;
    let frozenCount = 0;

    // Active (live) sessions - highest urgency (reduced if frozen)
    activeHighRisk.forEach(s => {
      const frozen = isSessionFrozen(s);
      if (frozen) frozenCount++;
      if (s.risk_level === 'critical') score += frozen ? 5 : 35;
      else if (s.risk_level === 'high') score += frozen ? 2 : 15;
    });

    // Unreviewed completed sessions - check frozen status per session
    sessionsNeedingReview.forEach(s => {
      const frozen = isSessionFrozen(s);
      if (frozen) frozenCount++;
      if (s.risk_level === 'critical') score += frozen ? 5 : 25;
      else if (s.risk_level === 'high') score += frozen ? 2 : 10;
      else if (s.risk_level === 'medium') score += frozen ? 1 : 3;
    });

    // Active bans signal ongoing threat environment
    const activeBanCount = recentBans.filter(b => !b.lifted_at).length;
    score += activeBanCount * 5;

    // If there are priority sessions and ALL of them are frozen → frozen level
    const allFrozen = totalPriority > 0 && frozenCount === totalPriority;

    let level: string;
    if (allFrozen) level = 'frozen';
    else if (score >= 75) level = 'critical';
    else if (score >= 50) level = 'severe';
    else if (score >= 25) level = 'elevated';
    else if (score >= 10) level = 'guarded';
    else level = 'normal';

    return { threatLevel: level, threatScore: score };
  }, [activeSessions, sessionsNeedingReview, recentBans, isSessionFrozen]);

  const getThreatLevelConfig = (level: string) => {
    switch (level) {
      case 'frozen':
        return { label: 'FROZEN', bg: 'bg-gradient-to-r from-cyan-700 to-cyan-600', dotColor: 'bg-cyan-400' };
      case 'critical':
        return { label: 'CRITICAL', bg: 'bg-gradient-to-r from-red-700 to-red-600', dotColor: 'bg-red-400' };
      case 'severe':
        return { label: 'SEVERE', bg: 'bg-gradient-to-r from-red-600 to-orange-600', dotColor: 'bg-red-400' };
      case 'elevated':
        return { label: 'ELEVATED', bg: 'bg-gradient-to-r from-orange-600 to-orange-500', dotColor: 'bg-orange-400' };
      case 'guarded':
        return { label: 'GUARDED', bg: 'bg-gradient-to-r from-amber-600 to-amber-500', dotColor: 'bg-amber-400' };
      default:
        return { label: 'NORMAL', bg: 'bg-gradient-to-r from-emerald-600 to-emerald-500', dotColor: 'bg-emerald-400' };
    }
  };

  const threatConfig = getThreatLevelConfig(threatLevel);

  const getRiskBadgeStyle = (level: string) => {
    switch (level) {
      case 'critical': return 'bg-red-600 text-white';
      case 'high': return 'bg-orange-500 text-white';
      case 'medium': return 'bg-amber-500 text-white';
      default: return 'bg-slate-400 text-white';
    }
  };

  // Attack pattern config with SVG icons
  const attackPatterns = [
    { key: 'privilege_escalation', label: 'Privilege Escalation', tactic: 'TA0004', icon: Icons.arrowUp },
    { key: 'credential_access', label: 'Credential Access', tactic: 'TA0006', icon: Icons.key },
    { key: 'defense_evasion', label: 'Defense Evasion', tactic: 'TA0005', icon: Icons.eyeOff },
    { key: 'lateral_movement', label: 'Lateral Movement', tactic: 'TA0008', icon: Icons.arrowsExpand },
    { key: 'data_exfiltration', label: 'Data Exfiltration', tactic: 'TA0010', icon: Icons.upload },
    { key: 'persistence', label: 'Persistence', tactic: 'TA0003', icon: Icons.link },
  ];

  return (
    <div className="space-y-3">
      {/* ============================================ */}
      {/* COMPACT THREAT BAR */}
      {/* ============================================ */}
      <div className={`${threatConfig.bg} rounded-lg ${threatLevel === 'critical' || threatLevel === 'severe' ? 'shadow-lg shadow-red-900/30' : ''}`}>
        <div className="px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-2.5 h-2.5 ${threatConfig.dotColor} rounded-full ${threatLevel === 'critical' || threatLevel === 'severe' ? 'animate-pulse' : ''}`}></div>
            <span className="text-white/70 text-xs font-medium">THREAT LEVEL:</span>
            <span className="text-white font-bold text-sm tracking-wide">{threatConfig.label}</span>
            <span className="text-white/50 text-xs hidden sm:inline">
              {threatLevel === 'frozen' ? '— All threats contained' :
               threatLevel === 'normal' ? '— All systems normal' :
               threatLevel === 'guarded' ? '— Monitor closely' :
               threatLevel === 'elevated' ? '— Attention required' :
               threatLevel === 'severe' ? '— Urgent attention needed' :
               '— Immediate action required'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {[
              { label: 'C', count: riskCounts.critical, bg: 'bg-red-600/80', text: 'text-white', border: 'ring-1 ring-red-500/50' },
              { label: 'H', count: riskCounts.high, bg: 'bg-orange-600/80', text: 'text-white', border: 'ring-1 ring-orange-500/50' },
              { label: 'M', count: riskCounts.medium, bg: 'bg-amber-600/80', text: 'text-white', border: 'ring-1 ring-amber-500/50' },
              { label: 'L', count: riskCounts.low, bg: 'bg-slate-600/80', text: 'text-slate-200', border: 'ring-1 ring-slate-500/50' },
            ].map((item) => (
              <div key={item.label} className={`${item.bg} ${item.border} px-2 py-1 rounded text-center min-w-[36px]`}>
                <span className={`${item.text} text-xs font-bold`}>{item.count}</span>
              </div>
            ))}
            {priorityUnreviewedCount > 0 && (
              <button
                onClick={() => navigate('/sessions?risk=critical,high,medium&reviewed=false')}
                className="ml-2 px-3 py-1.5 bg-white/90 text-red-600 text-xs font-semibold rounded hover:bg-white transition-colors flex items-center gap-1"
              >
                Review
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ============================================ */}
      {/* MAIN 2-COLUMN LAYOUT */}
      {/* ============================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
        {/* LEFT: Priority Review (3/5 = 60%) - Glassmorphism */}
        <div className={`lg:col-span-3 glass-card rounded-xl border ${priorityReviewCount > 0 ? 'border-red-500/30 shadow-[0_0_20px_rgba(239,68,68,0.1)]' : 'border-slate-700/50'}`}>
          <div className="px-4 py-3 border-b border-slate-700/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded flex items-center justify-center ${priorityReviewCount > 0 ? 'bg-red-500/20 text-red-400' : 'bg-slate-700/50 text-slate-400'}`}>
                {Icons.shield}
              </div>
              <h2 className="font-semibold text-slate-100 text-sm">Priority Review</h2>
              {priorityReviewCount > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] font-bold bg-red-500/20 text-red-400 rounded">
                  {priorityReviewCount}
                </span>
              )}
            </div>
            <button onClick={openPriorityReviewModal} className="text-xs text-blue-400 hover:text-blue-300">
              View All
            </button>
          </div>
          <div className="p-2.5 min-h-[150px]">
            {priorityReviewCount === 0 ? (
              <div className="flex flex-col items-center justify-center h-full min-h-[126px]">
                <div className="w-12 h-12 bg-emerald-500/10 rounded-full flex items-center justify-center mb-3 ring-2 ring-emerald-500/20">
                  <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-emerald-400 text-sm font-semibold">All Clear</p>
                <p className="text-slate-500 text-xs mt-1">No high-risk sessions require review</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {/* Live Critical Sessions */}
                {activeSessions.filter(s => s.risk_level === 'critical' || s.risk_level === 'high').slice(0, 2).map((session, idx) => {
                  const userBanned = bannedUserIds.has(session.user_id);
                  const serverDisabled = isServerDisabled(session.server_id);
                  const frozen = userBanned && serverDisabled;
                  return (
                  <div key={session.id} className={`flex items-center gap-3 p-2.5 rounded-lg border transition-all animate-fade-in ${session.risk_level === 'critical' ? 'border-red-500/40 bg-red-950/30 hover:bg-red-950/40' : 'border-orange-500/40 bg-orange-950/30 hover:bg-orange-950/40'}`} style={{ animationDelay: `${idx * 50}ms` }}>
                    <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded flex-shrink-0 ${getRiskBadgeStyle(session.risk_level || 'low')}`}>
                      {session.risk_level?.toUpperCase()}
                    </span>
                    <span className="font-medium text-slate-200 text-sm truncate flex items-center gap-1">
                      {session.servers?.name || session.server_name || 'Unknown'}
                      {serverDisabled && <svg className="w-3 h-3 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>}
                    </span>
                    <div className="flex items-center gap-1.5 hidden sm:flex">
                      <span className="flex items-center gap-0.5">
                        <span className="text-xs text-slate-500 truncate">{session.user?.display_name || session.user?.username || session.user?.email?.split('@')[0] || 'Unknown'}</span>
                        {userBanned && <svg className="w-3 h-3 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>}
                      </span>
                      <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse flex-shrink-0"></span>
                    </div>
                    <span className="text-[10px] text-emerald-400/80 ml-auto hidden xl:inline">{formatDistanceToNow(new Date(session.started_at), { addSuffix: true })}</span>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => navigate('/live', { state: { selectedSessionId: session.id } })} className="px-2 py-1 text-[10px] font-medium bg-blue-600 text-white rounded hover:bg-blue-700">
                        Monitor
                      </button>
                      {frozen ? (
                        <span className="px-1.5 py-1 text-[10px] font-medium bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded">Frozen</span>
                      ) : (
                        <button onClick={() => handleFreeze(session)} className="px-1.5 py-1 text-[10px] font-medium text-cyan-400 border border-cyan-700/50 rounded hover:bg-cyan-900/30">
                          Freeze
                        </button>
                      )}
                    </div>
                  </div>
                  );
                })}
                {/* Ended Sessions Needing Review */}
                {sessionsNeedingReview.slice(0, 5).map((session, idx) => {
                  const userBanned = bannedUserIds.has(session.user_id);
                  const serverDisabled = isServerDisabled(session.server_id);
                  const frozen = userBanned && serverDisabled;
                  return (
                  <div key={session.id} className={`flex items-center gap-3 p-2.5 rounded-lg border transition-all cursor-pointer animate-fade-in ${session.risk_level === 'critical' ? 'border-red-500/20 bg-red-950/10 hover:bg-red-950/30 hover:border-red-500/40 hover:shadow-[0_0_12px_rgba(239,68,68,0.1)]' : 'border-orange-500/20 bg-orange-950/10 hover:bg-orange-950/30 hover:border-orange-500/40 hover:shadow-[0_0_12px_rgba(251,146,60,0.1)]'}`} style={{ animationDelay: `${idx * 50}ms` }} onClick={() => navigate(`/sessions/${session.id}`)}>
                    <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded flex-shrink-0 ${getRiskBadgeStyle(session.risk_level || 'low')}`}>
                      {session.risk_level?.toUpperCase()}
                    </span>
                    <span className="font-medium text-slate-200 text-sm truncate flex items-center gap-1">
                      {session.servers?.name || session.server_name || 'Unknown'}
                      {serverDisabled && <svg className="w-3 h-3 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>}
                    </span>
                    <span className="hidden sm:flex items-center gap-0.5">
                      <span className="text-xs text-slate-500 truncate">{session.user?.display_name || session.user?.username || session.user?.email?.split('@')[0] || 'Unknown'}</span>
                      {userBanned && <svg className="w-3 h-3 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>}
                    </span>
                    {getMitreTactic(session) && (
                      <span className="text-[10px] text-red-400/80 hidden lg:inline">{getMitreTactic(session)}</span>
                    )}
                    <span className="text-[10px] text-slate-500 ml-auto hidden xl:inline">{formatDistanceToNow(new Date(session.ended_at || session.started_at), { addSuffix: true })}</span>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {frozen ? (
                        <span className="px-1.5 py-1 text-[10px] font-medium bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded">Frozen</span>
                      ) : (
                        <button onClick={(e) => { e.stopPropagation(); handleFreeze(session); }} className="px-1.5 py-1 text-[10px] font-medium text-cyan-400 border border-cyan-700/50 rounded hover:bg-cyan-900/30">
                          Freeze
                        </button>
                      )}
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Stats + Risk Widgets (2/5 = 40%) */}
        <div className="lg:col-span-2 space-y-3">
          {/* Compact Stats Row */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-slate-800/80 rounded-xl p-3 border border-slate-700/50 cursor-pointer card-hover active:scale-[0.98]" onClick={() => navigate('/sessions?reviewed=false')}>
              <p className="text-[10px] font-medium text-slate-500 uppercase">Unreviewed</p>
              <p className="text-xl font-bold text-slate-200">{unreviewedCount}</p>
            </div>
            <div className={`bg-slate-800/80 rounded-xl p-3 border cursor-pointer card-hover active:scale-[0.98] ${activeSessions.length > 0 ? 'border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.1)]' : 'border-slate-700/50'}`} onClick={() => navigate('/live')}>
              <p className="text-[10px] font-medium text-slate-500 uppercase">Active</p>
              <div className="flex items-center gap-1.5">
                <p className={`text-xl font-bold ${activeSessions.length > 0 ? 'text-emerald-400' : 'text-slate-200'}`}>{activeSessions.length}</p>
                {activeSessions.length > 0 && <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span>}
              </div>
            </div>
            <div className="bg-slate-800/80 rounded-xl p-3 border border-slate-700/50 cursor-pointer card-hover active:scale-[0.98]" onClick={() => navigate('/sessions')}>
              <p className="text-[10px] font-medium text-slate-500 uppercase">Today</p>
              <p className="text-xl font-bold text-slate-200">{stats?.sessionsToday || 0}</p>
            </div>
          </div>

          {/* Risk Users */}
          <div className="bg-slate-800/80 rounded-xl border border-slate-700/50 card-hover">
            <div className="px-3 py-2 border-b border-slate-700/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 bg-amber-500/20 rounded flex items-center justify-center">
                  <svg className="w-3 h-3 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                </div>
                <span className="font-medium text-slate-200 text-xs">Risk Users</span>
              </div>
              <button onClick={openRiskUsersModal} className="text-[10px] text-blue-400 hover:text-blue-300">View All</button>
            </div>
            <div className="p-2 min-h-[76px]">
              {riskLoading && highRiskUsers.length === 0 ? (
                <div className="space-y-2 py-1">
                  <div className="flex items-center gap-2"><div className="skeleton w-6 h-6 rounded-full"></div><div className="skeleton h-4 flex-1"></div><div className="skeleton w-8 h-5"></div></div>
                  <div className="flex items-center gap-2"><div className="skeleton w-6 h-6 rounded-full"></div><div className="skeleton h-4 flex-1"></div><div className="skeleton w-8 h-5"></div></div>
                  <div className="flex items-center gap-2"><div className="skeleton w-6 h-6 rounded-full"></div><div className="skeleton h-4 flex-1"></div><div className="skeleton w-8 h-5"></div></div>
                </div>
              ) : highRiskUsers.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full min-h-[52px]">
                  <div className="w-8 h-8 bg-emerald-500/10 rounded-full flex items-center justify-center mb-2">
                    <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-emerald-400 text-xs font-medium">No high-risk users</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {highRiskUsers.slice(0, 2).map((user, idx) => {
                    const isUnknown = !user.users?.display_name && !user.users?.username && !user.users?.email;
                    const searchTerm = user.users?.username || user.users?.display_name || user.users?.email?.split('@')[0] || '';
                    return (
                      <div key={user.user_id} className="flex items-center justify-between p-1.5 rounded-lg hover:bg-slate-700/50 cursor-pointer transition-colors animate-fade-in" style={{ animationDelay: `${idx * 50}ms` }} onClick={() => searchTerm && navigate(`/users?search=${encodeURIComponent(searchTerm)}`)}>
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium ring-2 ring-offset-1 ring-offset-slate-800 ${isUnknown ? 'bg-amber-500/20 text-amber-400 ring-amber-500/30' : 'bg-red-500/20 text-red-400 ring-red-500/30'}`}>
                            {isUnknown ? '?' : (user.users?.display_name?.[0] || user.users?.email?.[0] || '?').toUpperCase()}
                          </div>
                          <span className={`text-xs truncate ${isUnknown ? 'text-amber-400' : 'text-slate-300'}`}>
                            {isUnknown ? 'Unidentified' : (user.users?.display_name || user.users?.username || user.users?.email?.split('@')[0])}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${user.risk_score_7d >= 50 ? 'bg-red-500/20 text-red-400' : 'bg-orange-500/20 text-orange-400'}`}>{user.risk_score_7d.toFixed(0)}</span>
                          {bannedUserIds.has(user.user_id) ? (
                            <span className="px-1.5 py-0.5 text-[8px] font-bold bg-red-500/20 text-red-400 border border-red-500/30 rounded uppercase">Banned</span>
                          ) : (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleBanRiskUser(user); }}
                              className="px-1.5 py-0.5 text-[10px] font-medium text-red-400 border border-red-700/50 rounded hover:bg-red-900/30 transition-colors"
                            >
                              Ban
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Risk Servers */}
          <div className="bg-slate-800/80 rounded-xl border border-slate-700/50 card-hover">
            <div className="px-3 py-2 border-b border-slate-700/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 bg-cyan-500/20 rounded flex items-center justify-center">
                  <svg className="w-3 h-3 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" /></svg>
                </div>
                <span className="font-medium text-slate-200 text-xs">Risk Servers</span>
              </div>
              <button onClick={openRiskServersModal} className="text-[10px] text-blue-400 hover:text-blue-300">View All</button>
            </div>
            <div className="p-2 min-h-[76px]">
              {riskLoading && highRiskServers.length === 0 ? (
                <div className="space-y-2 py-1">
                  <div className="flex items-center gap-2"><div className="skeleton w-6 h-6 rounded-full"></div><div className="skeleton h-4 flex-1"></div><div className="skeleton w-8 h-5"></div></div>
                  <div className="flex items-center gap-2"><div className="skeleton w-6 h-6 rounded-full"></div><div className="skeleton h-4 flex-1"></div><div className="skeleton w-8 h-5"></div></div>
                  <div className="flex items-center gap-2"><div className="skeleton w-6 h-6 rounded-full"></div><div className="skeleton h-4 flex-1"></div><div className="skeleton w-8 h-5"></div></div>
                </div>
              ) : highRiskServers.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full min-h-[52px]">
                  <div className="w-8 h-8 bg-emerald-500/10 rounded-full flex items-center justify-center mb-2">
                    <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-emerald-400 text-xs font-medium">No high-risk servers</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {highRiskServers.slice(0, 2).map((server, idx) => {
                    const searchTerm = server.servers?.name || server.servers?.host || '';
                    const isEnabled = getServerEnabled(server);
                    return (
                      <div key={server.server_id} className="flex items-center justify-between p-1.5 rounded-lg hover:bg-slate-700/50 cursor-pointer transition-colors animate-fade-in" style={{ animationDelay: `${idx * 50}ms` }} onClick={() => searchTerm && navigate(`/servers?search=${encodeURIComponent(searchTerm)}`)}>
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-6 h-6 bg-cyan-500/20 rounded-full flex items-center justify-center ring-2 ring-offset-1 ring-offset-slate-800 ring-cyan-500/30">
                            <svg className="w-3 h-3 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" /></svg>
                          </div>
                          <span className="text-xs text-slate-300 truncate">{server.servers?.name || 'Unknown'}</span>
                          {!isEnabled && <span className="px-1 py-0.5 text-[8px] font-bold bg-slate-500/20 text-slate-400 border border-slate-500/30 rounded uppercase">Disabled</span>}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${server.risk_score_7d >= 50 ? 'bg-red-500/20 text-red-400' : 'bg-orange-500/20 text-orange-400'}`}>{server.risk_score_7d.toFixed(0)}</span>
                          <button
                            onClick={(e) => handleToggleServer(server.server_id, isEnabled, e)}
                            className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${isEnabled ? 'bg-green-600' : 'bg-slate-600'}`}
                            title={isEnabled ? 'Click to disable' : 'Click to enable'}
                          >
                            <span className={`inline-block h-2.5 w-2.5 transform rounded-full bg-white transition-transform ${isEnabled ? 'translate-x-4' : 'translate-x-1'}`} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ============================================ */}
      {/* BOTTOM ROW: Activity + Attack Patterns */}
      {/* ============================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Recent Activity */}
        <div className="bg-slate-800/80 rounded-xl border border-slate-700/50 card-hover">
          <div className="px-4 py-2.5 border-b border-slate-700/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-medium text-slate-200 text-sm">Recent Activity</span>
            </div>
            <button onClick={openActivityModal} className="text-[10px] text-blue-400 hover:text-blue-300">View All</button>
          </div>
          <div className="p-2">
            {recentActivity.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full min-h-[86px] text-slate-500">
                <svg className="w-6 h-6 mb-1.5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-xs">No recent activity</p>
              </div>
            ) : (
              <div className="space-y-0.5">
                {recentActivity.slice(0, 6).map((activity, idx) => (
                  <div
                    key={activity.id}
                    className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-700/50 cursor-pointer transition-colors animate-fade-in"
                    style={{ animationDelay: `${idx * 30}ms` }}
                    onClick={() => activity.sessionId && navigate(`/sessions/${activity.sessionId}`)}
                  >
                    {/* Activity type icon */}
                    {activity.type === 'alert' ? (
                      <svg className={`w-3.5 h-3.5 flex-shrink-0 ${activity.level === 'critical' ? 'text-red-400' : 'text-orange-400'}`} fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    ) : activity.type === 'session_start' ? (
                      <svg className="w-3.5 h-3.5 flex-shrink-0 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                      </svg>
                    ) : activity.type === 'session_end' ? (
                      <svg className={`w-3.5 h-3.5 flex-shrink-0 ${activity.level === 'critical' ? 'text-red-400' : activity.level === 'high' ? 'text-orange-400' : 'text-slate-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                    ) : activity.type === 'ban' ? (
                      <svg className="w-3.5 h-3.5 flex-shrink-0 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                      </svg>
                    ) : activity.type === 'unban' ? (
                      <svg className="w-3.5 h-3.5 flex-shrink-0 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    ) : activity.type === 'kick' ? (
                      <svg className="w-3.5 h-3.5 flex-shrink-0 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 12h-6" />
                      </svg>
                    ) : (
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        activity.level === 'critical' ? 'bg-red-400' : activity.level === 'high' ? 'bg-orange-400' : 'bg-slate-500'
                      }`}></div>
                    )}
                    <span className="text-xs text-slate-300 truncate flex-1">{activity.message}</span>
                    <span className="text-[10px] text-slate-500 flex-shrink-0">{formatDistanceToNow(activity.timestamp, { addSuffix: true })}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Attack Patterns - 2x3 Grid with Colored Icons */}
        <div className="bg-slate-800/80 rounded-xl border border-slate-700/50 card-hover">
          <div className="px-4 py-2.5 border-b border-slate-700/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-violet-400">{Icons.target}</span>
              <span className="font-medium text-slate-200 text-sm">Attack Patterns</span>
              <span className="text-[10px] text-slate-500">MITRE ATT&CK</span>
            </div>
          </div>
          <div className="p-2 min-h-[110px]">
            {riskLoading && !behavioralSummary ? (
              <div className="grid grid-cols-3 gap-2">
                {[1,2,3,4,5,6].map(i => (
                  <div key={i} className="p-2 rounded-lg border border-slate-700/30">
                    <div className="flex items-center gap-2">
                      <div className="skeleton w-5 h-5 rounded"></div>
                      <div className="skeleton h-4 w-6"></div>
                    </div>
                    <div className="skeleton h-3 w-16 mt-1.5"></div>
                  </div>
                ))}
              </div>
            ) : behavioralSummary ? (
              <div className="grid grid-cols-3 gap-2">
                {attackPatterns.map((pattern, index) => {
                  const count = behavioralSummary[pattern.key as keyof BehavioralSummary] || 0;
                  const hasActivity = count > 0;
                  const colorClasses = [
                    { text: 'text-red-400', bg: 'attack-pattern-active' },
                    { text: 'text-amber-400', bg: 'attack-pattern-amber' },
                    { text: 'text-violet-400', bg: 'attack-pattern-violet' },
                    { text: 'text-blue-400', bg: 'attack-pattern-blue' },
                    { text: 'text-rose-400', bg: 'attack-pattern-rose' },
                    { text: 'text-cyan-400', bg: 'attack-pattern-cyan' },
                  ];
                  const colors = colorClasses[index];
                  return (
                    <div
                      key={pattern.key}
                      className={`p-2.5 rounded-lg border transition-all cursor-pointer animate-fade-in ${
                        hasActivity
                          ? `border-slate-600 ${colors.bg} hover:border-slate-500`
                          : 'border-slate-700/30 bg-slate-900/20 hover:bg-slate-800/50'
                      }`}
                      style={{ animationDelay: `${index * 30}ms` }}
                      onClick={() => hasActivity && navigate(`/sessions?flag=${pattern.key}`)}
                    >
                      <div className="flex items-center gap-2">
                        <span className={hasActivity ? colors.text : 'text-slate-600'}>{pattern.icon}</span>
                        <span className={`text-lg font-bold ${hasActivity ? colors.text : 'text-slate-600'}`}>{count}</span>
                      </div>
                      <p className={`text-[10px] mt-1 ${hasActivity ? 'text-slate-400' : 'text-slate-600'}`}>{pattern.label}</p>
                      <p className="text-[9px] text-slate-600">{pattern.tactic}</p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full min-h-[90px] text-slate-500">
                <svg className="w-6 h-6 mb-1.5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <p className="text-xs">No attack patterns detected</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ============================================ */}
      {/* BAN USER DIALOG */}
      {/* ============================================ */}
      {banDialogOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl shadow-xl max-w-md w-full mx-4 overflow-hidden border border-slate-700">
            <div className="p-5 border-b border-slate-700">
              <h3 className="text-lg font-semibold text-slate-100">Ban User</h3>
              <p className="text-sm text-slate-400 mt-1">Ban {banTarget?.userName} from accessing servers</p>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Reason <span className="text-red-500">*</span></label>
                <textarea
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none text-slate-100 placeholder-slate-500"
                  rows={3}
                  placeholder="Enter reason for ban..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Duration</label>
                <select
                  value={banDuration}
                  onChange={(e) => setBanDuration(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent text-slate-100"
                >
                  <option value="1h">1 Hour</option>
                  <option value="24h">24 Hours</option>
                  <option value="7d">7 Days</option>
                  <option value="30d">30 Days</option>
                  <option value="permanent">Permanent</option>
                </select>
              </div>
              {banError && (
                <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg">
                  <p className="text-sm text-red-400">{banError}</p>
                </div>
              )}
            </div>
            <div className="p-5 bg-slate-900 flex items-center justify-between border-t border-slate-700">
              <p className="text-xs text-slate-500">
                User will be banned from ALL servers
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setBanDialogOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={submitBan}
                  disabled={!banReason.trim() || banSubmitting}
                  className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {banSubmitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Banning...
                    </>
                  ) : (
                    'Ban User'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================ */}
      {/* RISK USERS MODAL */}
      {/* ============================================ */}
      {riskUsersModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setRiskUsersModalOpen(false)}>
          <div className="bg-slate-800 rounded-xl shadow-xl max-w-lg w-full mx-4 overflow-hidden border border-slate-700 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-amber-500/20 rounded flex items-center justify-center">
                  <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                </div>
                <h3 className="text-lg font-semibold text-slate-100">High Risk Users</h3>
                <span className="px-2 py-0.5 text-xs font-medium bg-slate-700 text-slate-300 rounded">{riskUsersModalData.length}</span>
              </div>
              <button onClick={() => setRiskUsersModalOpen(false)} className="p-1 hover:bg-slate-700 rounded-lg transition-colors">
                <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {riskUsersModalLoading ? (
                <div className="space-y-2 py-2">
                  {[1,2,3,4,5].map(i => (
                    <div key={i} className="flex items-center gap-3 p-2 animate-pulse">
                      <div className="skeleton w-8 h-8 rounded-full"></div>
                      <div className="flex-1"><div className="skeleton h-4 w-32"></div><div className="skeleton h-3 w-24 mt-1"></div></div>
                      <div className="skeleton w-10 h-6 rounded"></div>
                    </div>
                  ))}
                </div>
              ) : riskUsersModalData.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="w-12 h-12 bg-emerald-500/10 rounded-full flex items-center justify-center mb-3">
                    <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-emerald-400 text-sm font-medium">No high-risk users</p>
                  <p className="text-slate-500 text-xs mt-1">All users are within normal risk levels</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {riskUsersModalData.map((user) => {
                    const isUnknown = !user.users?.display_name && !user.users?.username && !user.users?.email;
                    const searchTerm = user.users?.username || user.users?.display_name || user.users?.email?.split('@')[0] || '';
                    return (
                      <div key={user.user_id} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-slate-700/50 cursor-pointer transition-colors" onClick={() => { setRiskUsersModalOpen(false); searchTerm && navigate(`/users?search=${encodeURIComponent(searchTerm)}`); }}>
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ring-2 ring-offset-1 ring-offset-slate-800 ${isUnknown ? 'bg-amber-500/20 text-amber-400 ring-amber-500/30' : 'bg-red-500/20 text-red-400 ring-red-500/30'}`}>
                            {isUnknown ? '?' : (user.users?.display_name?.[0] || user.users?.email?.[0] || '?').toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className={`text-sm font-medium truncate ${isUnknown ? 'text-amber-400' : 'text-slate-200'}`}>
                              {isUnknown ? 'Unidentified' : (user.users?.display_name || user.users?.username || user.users?.email?.split('@')[0])}
                            </p>
                            <p className="text-xs text-slate-500">{user.high_risk_sessions} high-risk sessions</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {bannedUserIds.has(user.user_id) && <span className="px-1.5 py-0.5 text-[9px] font-bold bg-red-500/20 text-red-400 border border-red-500/30 rounded uppercase">Banned</span>}
                          <span className={`px-2 py-1 text-xs font-bold rounded ${user.risk_score_7d >= 50 ? 'bg-red-500/20 text-red-400' : 'bg-orange-500/20 text-orange-400'}`}>{user.risk_score_7d.toFixed(0)}</span>
                          {!bannedUserIds.has(user.user_id) && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setRiskUsersModalOpen(false); handleBanRiskUser(user); }}
                              className="px-2 py-1 text-xs font-medium text-red-400 border border-red-700/50 rounded hover:bg-red-900/30 transition-colors"
                            >
                              Ban
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================ */}
      {/* RISK SERVERS MODAL */}
      {/* ============================================ */}
      {riskServersModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setRiskServersModalOpen(false)}>
          <div className="bg-slate-800 rounded-xl shadow-xl max-w-lg w-full mx-4 overflow-hidden border border-slate-700 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-cyan-500/20 rounded flex items-center justify-center">
                  <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" /></svg>
                </div>
                <h3 className="text-lg font-semibold text-slate-100">High Risk Servers</h3>
                <span className="px-2 py-0.5 text-xs font-medium bg-slate-700 text-slate-300 rounded">{riskServersModalData.length}</span>
              </div>
              <button onClick={() => setRiskServersModalOpen(false)} className="p-1 hover:bg-slate-700 rounded-lg transition-colors">
                <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {riskServersModalLoading ? (
                <div className="space-y-2 py-2">
                  {[1,2,3,4,5].map(i => (
                    <div key={i} className="flex items-center gap-3 p-2 animate-pulse">
                      <div className="skeleton w-8 h-8 rounded-full"></div>
                      <div className="flex-1"><div className="skeleton h-4 w-32"></div><div className="skeleton h-3 w-24 mt-1"></div></div>
                      <div className="skeleton w-10 h-6 rounded"></div>
                    </div>
                  ))}
                </div>
              ) : riskServersModalData.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="w-12 h-12 bg-emerald-500/10 rounded-full flex items-center justify-center mb-3">
                    <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-emerald-400 text-sm font-medium">No high-risk servers</p>
                  <p className="text-slate-500 text-xs mt-1">All servers are within normal risk levels</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {riskServersModalData.map((server) => {
                    const searchTerm = server.servers?.name || server.servers?.host || '';
                    const isEnabled = getServerEnabled(server);
                    return (
                      <div key={server.server_id} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-slate-700/50 cursor-pointer transition-colors" onClick={() => { setRiskServersModalOpen(false); searchTerm && navigate(`/servers?search=${encodeURIComponent(searchTerm)}`); }}>
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 bg-cyan-500/20 rounded-full flex items-center justify-center ring-2 ring-offset-1 ring-offset-slate-800 ring-cyan-500/30">
                            <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" /></svg>
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm font-medium text-slate-200 truncate">{server.servers?.name || 'Unknown'}</p>
                              {!isEnabled && <span className="px-1.5 py-0.5 text-[8px] font-bold bg-slate-500/20 text-slate-400 border border-slate-500/30 rounded uppercase">Disabled</span>}
                            </div>
                            <p className="text-xs text-slate-500">{server.high_risk_sessions} high-risk sessions • {server.unique_users} users</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-1 text-xs font-bold rounded ${server.risk_score_7d >= 50 ? 'bg-red-500/20 text-red-400' : 'bg-orange-500/20 text-orange-400'}`}>{server.risk_score_7d.toFixed(0)}</span>
                          <button
                            onClick={(e) => handleToggleServer(server.server_id, isEnabled, e)}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${isEnabled ? 'bg-green-600' : 'bg-slate-600'}`}
                            title={isEnabled ? 'Click to disable' : 'Click to enable'}
                          >
                            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${isEnabled ? 'translate-x-5' : 'translate-x-1'}`} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================ */}
      {/* ACTIVITY MODAL (with infinite scroll) */}
      {/* ============================================ */}
      {activityModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setActivityModalOpen(false)}>
          <div className="bg-slate-800 rounded-xl shadow-xl max-w-2xl w-full mx-4 overflow-hidden border border-slate-700 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h3 className="text-lg font-semibold text-slate-100">Recent Activity</h3>
                <span className="px-2 py-0.5 text-xs font-medium bg-slate-700 text-slate-300 rounded">{activityModalData.length}</span>
              </div>
              <button onClick={() => setActivityModalOpen(false)} className="p-1 hover:bg-slate-700 rounded-lg transition-colors">
                <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div ref={activityModalRef} className="flex-1 overflow-y-auto p-3" onScroll={handleActivityScroll}>
              {activityModalLoading && activityModalData.length === 0 ? (
                <div className="space-y-2 py-2">
                  {[1,2,3,4,5,6].map(i => (
                    <div key={i} className="flex items-center gap-3 p-2 animate-pulse">
                      <div className="skeleton w-5 h-5 rounded"></div>
                      <div className="flex-1"><div className="skeleton h-4 w-48"></div></div>
                      <div className="skeleton w-16 h-4"></div>
                    </div>
                  ))}
                </div>
              ) : activityModalData.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="w-12 h-12 bg-slate-700/50 rounded-full flex items-center justify-center mb-3">
                    <svg className="w-6 h-6 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <p className="text-slate-400 text-sm font-medium">No recent activity</p>
                  <p className="text-slate-500 text-xs mt-1">Session activity will appear here</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {activityModalData.map((activity) => (
                    <div
                      key={activity.id}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-700/50 cursor-pointer transition-colors"
                      onClick={() => { setActivityModalOpen(false); activity.sessionId && navigate(`/sessions/${activity.sessionId}`); }}
                    >
                      {activity.type === 'alert' ? (
                        <svg className={`w-4 h-4 flex-shrink-0 ${activity.level === 'critical' ? 'text-red-400' : 'text-orange-400'}`} fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                      ) : activity.type === 'session_start' ? (
                        <svg className="w-4 h-4 flex-shrink-0 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                        </svg>
                      ) : activity.type === 'ban' ? (
                        <svg className="w-4 h-4 flex-shrink-0 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                        </svg>
                      ) : activity.type === 'unban' ? (
                        <svg className="w-4 h-4 flex-shrink-0 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      ) : (
                        <svg className={`w-4 h-4 flex-shrink-0 ${activity.level === 'critical' ? 'text-red-400' : activity.level === 'high' ? 'text-orange-400' : 'text-slate-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                      )}
                      <span className={`flex-1 text-sm truncate ${activity.level === 'critical' ? 'text-red-400' : activity.level === 'high' ? 'text-orange-400' : 'text-slate-300'}`}>
                        {activity.message}
                      </span>
                      <span className="text-xs text-slate-500 flex-shrink-0">{formatDistanceToNow(activity.timestamp, { addSuffix: true })}</span>
                    </div>
                  ))}
                  {activityModalLoading && (
                    <div className="flex items-center justify-center py-4">
                      <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                  )}
                  {!activityModalHasMore && activityModalData.length > 0 && (
                    <p className="py-4 text-center text-slate-600 text-xs">No more activity</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================ */}
      {/* PRIORITY REVIEW MODAL */}
      {/* ============================================ */}
      {priorityReviewModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setPriorityReviewModalOpen(false)}>
          <div className="bg-slate-800 rounded-xl shadow-xl max-w-2xl w-full mx-4 overflow-hidden border border-slate-700 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-red-500/20 rounded flex items-center justify-center">
                  {Icons.shield}
                </div>
                <h3 className="text-lg font-semibold text-slate-100">Priority Review</h3>
                <span className="px-2 py-0.5 text-xs font-medium bg-red-500/20 text-red-400 rounded">{priorityReviewModalData.length}</span>
              </div>
              <button onClick={() => setPriorityReviewModalOpen(false)} className="p-1 hover:bg-slate-700 rounded-lg transition-colors">
                <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {priorityReviewModalLoading ? (
                <div className="space-y-2 py-2">
                  {[1,2,3,4,5].map(i => (
                    <div key={i} className="flex items-center gap-3 p-2.5 animate-pulse">
                      <div className="skeleton w-14 h-5 rounded"></div>
                      <div className="skeleton h-4 w-32"></div>
                      <div className="skeleton h-3 w-20"></div>
                      <div className="flex-1"></div>
                      <div className="skeleton w-16 h-6 rounded"></div>
                    </div>
                  ))}
                </div>
              ) : priorityReviewModalData.length === 0 ? (
                <div className="text-center py-8">
                  <div className="w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <p className="text-emerald-400 font-medium">All Clear</p>
                  <p className="text-slate-500 text-sm">No sessions require priority review</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {priorityReviewModalData.map((session) => {
                    const userBanned = bannedUserIds.has(session.user_id);
                    const serverDisabled = isServerDisabled(session.server_id);
                    const frozen = userBanned && serverDisabled;
                    return (
                    <div
                      key={session.id}
                      className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-all ${
                        session._isActive
                          ? session.risk_level === 'critical' ? 'border-red-500/40 bg-red-950/30 hover:bg-red-950/40' : 'border-orange-500/40 bg-orange-950/30 hover:bg-orange-950/40'
                          : session.risk_level === 'critical' ? 'border-red-500/30 bg-red-950/20 hover:bg-red-950/40' : 'border-orange-500/30 bg-orange-950/20 hover:bg-orange-950/40'
                      }`}
                      onClick={() => { setPriorityReviewModalOpen(false); session._isActive ? navigate('/live', { state: { selectedSessionId: session.id } }) : navigate(`/sessions/${session.id}`); }}
                    >
                      <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded flex-shrink-0 ${getRiskBadgeStyle(session.risk_level || 'low')}`}>
                        {session.risk_level?.toUpperCase()}
                      </span>
                      <span className="font-medium text-slate-200 text-sm truncate flex items-center gap-1">
                        {session.servers?.name || session.server_name || 'Unknown'}
                        {serverDisabled && <svg className="w-3 h-3 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="flex items-center gap-0.5">
                          <span className="text-xs text-slate-500 truncate">{session.user?.display_name || session.user?.username || session.user?.email?.split('@')[0] || 'Unknown'}</span>
                          {userBanned && <svg className="w-3 h-3 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>}
                        </span>
                        {session._isActive && <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse flex-shrink-0"></span>}
                      </div>
                      <span className="text-xs text-slate-600 ml-auto flex-shrink-0">{formatDistanceToNow(new Date(session._isActive ? session.started_at : (session.ended_at || session.started_at)), { addSuffix: true })}</span>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {session._isActive ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); setPriorityReviewModalOpen(false); navigate('/live', { state: { selectedSessionId: session.id } }); }}
                            className="px-2 py-1 text-[10px] font-medium bg-blue-600 text-white rounded hover:bg-blue-700"
                          >
                            Monitor
                          </button>
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); setPriorityReviewModalOpen(false); handlePlayback(session); }}
                            className="px-2 py-1 text-[10px] font-medium bg-blue-600 text-white rounded hover:bg-blue-700"
                          >
                            Playback
                          </button>
                        )}
                        {frozen ? (
                          <span className="px-1.5 py-1 text-[10px] font-medium bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded">Frozen</span>
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); setPriorityReviewModalOpen(false); handleFreeze(session); }}
                            className="px-1.5 py-1 text-[10px] font-medium text-cyan-400 border border-cyan-700/50 rounded hover:bg-cyan-900/30"
                          >
                            Freeze
                          </button>
                        )}
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================ */}
      {/* FREEZE CONFIRMATION DIALOG */}
      {/* ============================================ */}
      {freezeDialogOpen && freezeTarget && (() => {
        const targetUserBanned = bannedUserIds.has(freezeTarget.userId);
        const targetServerDisabled = isServerDisabled(freezeTarget.serverId);
        const banPart = targetUserBanned
          ? <><strong>{freezeTarget.userName}</strong> is already banned</>
          : <>Permanently ban <strong>{freezeTarget.userName}</strong></>;
        const serverPart = targetServerDisabled
          ? <><strong>{freezeTarget.serverName}</strong> is already disabled</>
          : <>disable <strong>{freezeTarget.serverName}</strong></>;
        return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl shadow-xl max-w-md w-full mx-4 overflow-hidden border border-slate-700">
            <div className="p-5 border-b border-slate-700">
              <h3 className="text-lg font-semibold text-slate-100">Freeze User & Server</h3>
              <p className="text-sm text-slate-400 mt-1">Ban the user and disable the server in one action</p>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-700/50 rounded-lg p-3">
                  <div className="flex items-center gap-1.5">
                    <p className="text-[10px] font-medium text-slate-500 uppercase">User</p>
                    {targetUserBanned && <span className="px-1 py-0.5 text-[8px] font-bold bg-red-500/20 text-red-400 border border-red-500/30 rounded uppercase">Banned</span>}
                  </div>
                  <p className="text-sm font-medium text-slate-200 truncate">{freezeTarget.userName}</p>
                </div>
                <div className="bg-slate-700/50 rounded-lg p-3">
                  <div className="flex items-center gap-1.5">
                    <p className="text-[10px] font-medium text-slate-500 uppercase">Server</p>
                    {targetServerDisabled && <span className="px-1 py-0.5 text-[8px] font-bold bg-slate-500/20 text-slate-400 border border-slate-500/30 rounded uppercase">Disabled</span>}
                  </div>
                  <p className="text-sm font-medium text-slate-200 truncate">{freezeTarget.serverName}</p>
                </div>
              </div>
              <div className="bg-red-900/20 border border-red-700/30 rounded-lg p-3">
                <p className="text-xs text-red-400">
                  {banPart} and {serverPart}. Active sessions will be terminated.
                </p>
              </div>
            </div>
            <div className="p-5 bg-slate-900 flex items-center justify-end gap-3 border-t border-slate-700">
              <button
                onClick={() => setFreezeDialogOpen(false)}
                className="px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submitFreeze}
                disabled={freezeSubmitting}
                className="px-4 py-2 text-sm font-medium bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {freezeSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Freezing...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                    Freeze
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
}
