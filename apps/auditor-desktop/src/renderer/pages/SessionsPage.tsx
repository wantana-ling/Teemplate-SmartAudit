import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSessionStore, Session } from '../stores/sessionStore';
import { usePlaybackStore } from '../stores/playbackStore';
import { format } from 'date-fns';
import { api } from '../services/api';

// Behavioral flag options for the dropdown
const behavioralFlagOptions = [
  { value: '', label: 'All Patterns' },
  { value: 'privilege_escalation', label: 'Privilege Escalation' },
  { value: 'credential_access', label: 'Credential Access' },
  { value: 'defense_evasion', label: 'Defense Evasion' },
  { value: 'lateral_movement', label: 'Lateral Movement' },
  { value: 'data_exfiltration', label: 'Data Exfiltration' },
  { value: 'persistence', label: 'Persistence' },
];

export default function SessionsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { sessions, loading, error, fetchSessions, filters, setFilters } = useSessionStore();
  const { openPlayback } = usePlaybackStore();
  const [statusFilter, setStatusFilter] = useState('');
  const [riskFilter, setRiskFilter] = useState('');
  const [reviewedFilter, setReviewedFilter] = useState('');
  const [flagFilter, setFlagFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingRecording, setLoadingRecording] = useState<string | null>(null);
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  // Get search query from URL params on mount
  useEffect(() => {
    const search = searchParams.get('search');
    const risk = searchParams.get('risk');
    const reviewed = searchParams.get('reviewed');
    const status = searchParams.get('status');
    const flag = searchParams.get('flag');

    if (search) setSearchQuery(search);
    if (risk) setRiskFilter(risk);
    if (reviewed) setReviewedFilter(reviewed);
    if (status) setStatusFilter(status);
    if (flag) setFlagFilter(flag);

    // Apply URL filters
    const urlFilters: any = {};
    if (search) urlFilters.search = search;
    if (risk) urlFilters.riskLevel = risk;
    if (reviewed !== null && reviewed !== '') urlFilters.reviewed = reviewed === 'true';
    if (status) urlFilters.status = status;
    if (flag) urlFilters.flag = flag;

    if (Object.keys(urlFilters).length > 0) {
      setFilters(urlFilters);
    } else {
      fetchSessions();
    }

    // Mark initial load as done after a short delay to prevent debounced search from overwriting
    setTimeout(() => setInitialLoadDone(true), 350);
  }, []);

  // Debounced search - triggers automatically as user types (skip on initial load)
  useEffect(() => {
    if (!initialLoadDone) return;

    const timer = setTimeout(() => {
      const newFilters: any = {
        status: statusFilter || undefined,
        riskLevel: riskFilter || undefined,
        reviewed: reviewedFilter === '' ? undefined : reviewedFilter === 'true',
        flag: flagFilter || undefined,
        search: searchQuery.trim() || undefined,
      };

      // Update URL params
      const newParams = new URLSearchParams();
      if (searchQuery.trim()) newParams.set('search', searchQuery.trim());
      if (statusFilter) newParams.set('status', statusFilter);
      if (riskFilter) newParams.set('risk', riskFilter);
      if (reviewedFilter) newParams.set('reviewed', reviewedFilter);
      if (flagFilter) newParams.set('flag', flagFilter);
      setSearchParams(newParams);
      setFilters(newFilters);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, initialLoadDone]);

  const handlePlayRecording = async (e: React.MouseEvent, session: Session) => {
    e.stopPropagation();
    if (!session.guac_recording_url) return;

    setLoadingRecording(session.id);

    try {
      const response = await api.get<{ signedUrl: string }>(`/api/sessions/${session.id}/recording-url`);

      if (response.success && response.data?.signedUrl) {
        openPlayback(session, response.data.signedUrl);
      }
    } catch (err) {
      console.error('Failed to get recording URL:', err);
    } finally {
      setLoadingRecording(null);
    }
  };

  const handleFilterChange = (key: string, value: string) => {
    const newFilters: any = { ...filters };
    const newParams = new URLSearchParams(searchParams);

    if (key === 'status') {
      setStatusFilter(value);
      newFilters.status = value || undefined;
      if (value) newParams.set('status', value);
      else newParams.delete('status');
    } else if (key === 'riskLevel') {
      setRiskFilter(value);
      newFilters.riskLevel = value || undefined;
      if (value) newParams.set('risk', value);
      else newParams.delete('risk');
    } else if (key === 'reviewed') {
      setReviewedFilter(value);
      newFilters.reviewed = value === '' ? undefined : value === 'true';
      if (value) newParams.set('reviewed', value);
      else newParams.delete('reviewed');
    } else if (key === 'flag') {
      setFlagFilter(value);
      newFilters.flag = value || undefined;
      if (value) newParams.set('flag', value);
      else newParams.delete('flag');
    }

    setSearchParams(newParams);
    setFilters(newFilters);
  };

  const getRiskBadge = (level: string | null, status?: string) => {
    if (!level) {
      // Show "Pending" for completed sessions that haven't been analyzed
      if (status === 'disconnected') {
        return (
          <span className="px-2 py-0.5 text-xs font-medium rounded bg-slate-700/50 text-slate-500 border border-slate-600/50">
            Pending
          </span>
        );
      }
      return null;
    }
    const colors: Record<string, string> = {
      critical: 'bg-red-500/20 text-red-400 border border-red-500/50',
      high: 'bg-orange-500/20 text-orange-400 border border-orange-500/50',
      medium: 'bg-amber-500/20 text-amber-400 border border-amber-500/50',
      low: 'bg-slate-500/20 text-slate-400 border border-slate-500/50',
    };
    return (
      <span className={`px-2 py-0.5 text-xs font-semibold rounded uppercase ${colors[level] || colors.low}`}>
        {level}
      </span>
    );
  };

  const hasActiveFilters = statusFilter || riskFilter || reviewedFilter || flagFilter || searchQuery;

  const clearAllFilters = () => {
    setStatusFilter('');
    setRiskFilter('');
    setReviewedFilter('');
    setFlagFilter('');
    setSearchQuery('');
    setSearchParams(new URLSearchParams());
    setFilters({});
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      active: 'bg-green-900/50 text-green-400 border border-green-700',
      disconnected: 'bg-slate-700 text-slate-400 border border-slate-600',
      error: 'bg-red-900/50 text-red-400 border border-red-700',
    };
    return (
      <span className={`px-2 py-0.5 text-xs font-medium rounded capitalize ${colors[status] || colors.disconnected}`}>
        {status}
      </span>
    );
  };

  const getReviewedBadge = (reviewed: boolean) => {
    if (reviewed) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded bg-green-900/50 text-green-400 border border-green-700">
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
          Reviewed
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded bg-yellow-900/50 text-yellow-400 border border-yellow-700">
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
        </svg>
        Pending
      </span>
    );
  };

  const formatDuration = (startedAt: string, endedAt: string | null) => {
    const start = new Date(startedAt);
    const end = endedAt ? new Date(endedAt) : new Date();
    const diff = Math.floor((end.getTime() - start.getTime()) / 1000);

    if (diff < 60) return `${diff}s`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ${diff % 60}s`;
    return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`;
  };

  // Compute stats for the header
  const criticalCount = sessions.filter(s => s.risk_level === 'critical').length;
  const highCount = sessions.filter(s => s.risk_level === 'high').length;
  const pendingCount = sessions.filter(s => !s.reviewed).length;

  return (
    <div className="space-y-4">
      {/* Compact Stats Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-sm">
          <span className="text-slate-400">{sessions.length} sessions</span>
          {criticalCount > 0 && (
            <>
              <span className="text-slate-600">•</span>
              <span className="text-red-400 font-medium">{criticalCount} critical</span>
            </>
          )}
          {highCount > 0 && (
            <>
              <span className="text-slate-600">•</span>
              <span className="text-orange-400 font-medium">{highCount} high</span>
            </>
          )}
          {pendingCount > 0 && (
            <>
              <span className="text-slate-600">•</span>
              <span className="text-amber-400 font-medium">{pendingCount} pending review</span>
            </>
          )}
        </div>
        {hasActiveFilters && (
          <button
            onClick={clearAllFilters}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-400 hover:text-slate-200 bg-slate-700/50 hover:bg-slate-700 rounded-lg transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Clear filters
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="bg-slate-800/80 rounded-xl border border-slate-700/50 p-3 flex items-center gap-3 flex-wrap">
        <div className="flex-1 relative min-w-[200px]">
          <input
            type="text"
            placeholder="Search by server, user, or tag"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-700/50 border border-slate-600/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-100 placeholder-slate-500 text-sm"
          />
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => handleFilterChange('status', e.target.value)}
            className="px-3 py-2 bg-slate-700/50 border border-slate-600/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-100 text-sm"
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="disconnected">Disconnected</option>
            <option value="error">Error</option>
          </select>
          <select
            value={riskFilter}
            onChange={(e) => handleFilterChange('riskLevel', e.target.value)}
            className="px-3 py-2 bg-slate-700/50 border border-slate-600/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-100 text-sm"
          >
            <option value="">All Risk Levels</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <select
            value={reviewedFilter}
            onChange={(e) => handleFilterChange('reviewed', e.target.value)}
            className="px-3 py-2 bg-slate-700/50 border border-slate-600/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-100 text-sm"
          >
            <option value="">All Review Status</option>
            <option value="false">Needs Review</option>
            <option value="true">Reviewed</option>
          </select>
          <select
            value={flagFilter}
            onChange={(e) => handleFilterChange('flag', e.target.value)}
            className="px-3 py-2 bg-slate-700/50 border border-slate-600/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-100 text-sm"
          >
            {behavioralFlagOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-4">
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {/* Sessions Table */}
      <div className="bg-slate-800 rounded-xl shadow-lg shadow-black/20 overflow-hidden border border-slate-700/50">
        <div className="overflow-x-auto max-h-[calc(100vh-280px)]">
          <table className="w-full">
            <thead className="bg-slate-900/95 backdrop-blur-sm border-b border-slate-700 sticky top-0 z-10">
              <tr>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Server</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">User</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Started</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Duration</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Risk</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Tags</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Review</th>
                <th className="text-right px-6 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {loading ? (
                // Loading skeletons
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-6 py-4">
                      <div className="space-y-2">
                        <div className="h-4 bg-slate-700 rounded w-24"></div>
                        <div className="h-3 bg-slate-700/50 rounded w-32"></div>
                      </div>
                    </td>
                    <td className="px-6 py-4"><div className="h-4 bg-slate-700 rounded w-20"></div></td>
                    <td className="px-6 py-4"><div className="h-4 bg-slate-700 rounded w-24"></div></td>
                    <td className="px-6 py-4"><div className="h-4 bg-slate-700 rounded w-16"></div></td>
                    <td className="px-6 py-4"><div className="h-6 bg-slate-700 rounded w-16"></div></td>
                    <td className="px-6 py-4"><div className="h-5 bg-slate-700 rounded w-20"></div></td>
                    <td className="px-6 py-4"><div className="h-5 bg-slate-700 rounded w-16"></div></td>
                    <td className="px-6 py-4"><div className="h-8 bg-slate-700 rounded w-20 ml-auto"></div></td>
                  </tr>
                ))
              ) : sessions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-slate-700/50 flex items-center justify-center">
                        <svg className="w-6 h-6 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <p className="text-slate-400 font-medium">No sessions found</p>
                      <p className="text-slate-500 text-sm">Try adjusting your filters or search query</p>
                    </div>
                  </td>
                </tr>
              ) : (
                sessions.map((session) => {
                const riskBorderColor = {
                  critical: '#ef4444',
                  high: '#f97316',
                  medium: '#f59e0b',
                  low: '#475569',
                }[session.risk_level || 'low'] || '#475569';

                return (
                  <tr
                    key={session.id}
                    className="hover:bg-slate-700/70 cursor-pointer transition-all duration-150 group"
                    style={{ borderLeft: `4px solid ${riskBorderColor}` }}
                    onClick={() => navigate(`/sessions/${session.id}`)}
                  >
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-3">
                        {session.status === 'active' && (
                          <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse flex-shrink-0"></div>
                        )}
                        <div>
                          <p className="font-medium text-slate-100 group-hover:text-white transition-colors">
                            {session.servers ? (
                              <span
                                className="hover:text-blue-400 transition-colors"
                                onClick={(e) => { e.stopPropagation(); navigate(`/servers?search=${encodeURIComponent(session.servers?.host ? `${session.servers.host}` : session.servers?.name || '')}`); }}
                              >
                                {session.servers.name}
                              </span>
                            ) : (
                              <span className="text-slate-400">{session.server_name || 'Unknown'}</span>
                            )}
                          </p>
                          <p className="text-xs text-slate-500">
                            {session.servers?.host || session.server_host || ''}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-3 text-slate-300 text-sm">
                      {session.user?.display_name || session.user?.username || session.user?.email ? (
                        <span
                          className="hover:text-blue-400 cursor-pointer transition-colors"
                          onClick={(e) => { e.stopPropagation(); navigate(`/users?search=${encodeURIComponent(session.user?.username || session.user?.display_name || session.user?.email?.split('@')[0] || '')}`); }}
                        >
                          {session.user?.display_name || session.user?.username || session.user?.email}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-6 py-3 text-slate-400 text-sm">
                      {format(new Date(session.started_at), 'MMM d, HH:mm')}
                    </td>
                    <td className="px-6 py-3 text-slate-300 font-mono text-sm">
                      {formatDuration(session.started_at, session.ended_at)}
                    </td>
                    <td className="px-6 py-3">
                      {getRiskBadge(session.risk_level, session.status)}
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex flex-col gap-1">
                        {session.tags && session.tags.length > 0 ? (
                          <>
                            {session.tags.slice(0, 2).map((tag, idx) => (
                              <div key={idx} className="flex items-center gap-1.5">
                                <span
                                  className="px-1.5 py-0.5 text-xs font-medium bg-slate-700/80 text-slate-300 rounded"
                                  style={{ maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                  title={tag}
                                >
                                  {tag}
                                </span>
                                {idx === 1 && session.tags.length > 2 && (
                                  <span className="px-1.5 py-0.5 text-xs font-medium bg-slate-600/50 text-slate-400 rounded">
                                    +{session.tags.length - 2}
                                  </span>
                                )}
                              </div>
                            ))}
                          </>
                        ) : (
                          <span className="text-xs text-slate-600">-</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      {getReviewedBadge(session.reviewed)}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-70 group-hover:opacity-100 transition-opacity">
                        {session.guac_recording_url && (
                          <button
                            onClick={(e) => handlePlayRecording(e, session)}
                            disabled={loadingRecording === session.id}
                            className="inline-flex items-center justify-center w-8 h-8 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors disabled:opacity-50"
                            title="Play Recording"
                          >
                            {loadingRecording === session.id ? (
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z" />
                              </svg>
                            )}
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/sessions/${session.id}`);
                          }}
                          className="inline-flex items-center justify-center w-8 h-8 text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-600 rounded-lg transition-colors"
                          title="View Details"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
