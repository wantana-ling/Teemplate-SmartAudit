import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSessionStore } from '../stores/sessionStore';
import { format } from 'date-fns';
import { api } from '../services/api';
import SessionPlayback from '../components/SessionPlayback';

export default function SessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    selectedSession,
    loading,
    error,
    fetchSession,
    clearSelectedSession,
    markReviewed,
    markUnreviewed,
    addTag,
    removeTag,
  } = useSessionStore();
  const [showPlayback, setShowPlayback] = useState(false);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [loadingRecording, setLoadingRecording] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [newTag, setNewTag] = useState('');
  const [isUpdatingReview, setIsUpdatingReview] = useState(false);
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [removingTag, setRemovingTag] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      fetchSession(id);
    }
    return () => clearSelectedSession();
  }, [id, fetchSession, clearSelectedSession]);

  const handlePlayRecording = async () => {
    if (!selectedSession?.guac_recording_url) return;

    setLoadingRecording(true);
    setRecordingError(null);

    try {
      const response = await api.get<{ signedUrl: string }>(`/api/sessions/${selectedSession.id}/recording-url`);

      if (response.success && response.data?.signedUrl) {
        setRecordingUrl(response.data.signedUrl);
        setShowPlayback(true);
      } else {
        setRecordingError(response.error || 'Failed to get recording URL');
      }
    } catch (err: any) {
      setRecordingError(err.message || 'Failed to load recording');
    } finally {
      setLoadingRecording(false);
    }
  };

  const handleClosePlayback = () => {
    setShowPlayback(false);
    setRecordingUrl(null);
  };

  const handleMarkReviewed = async () => {
    if (!selectedSession) return;
    setIsUpdatingReview(true);
    try {
      await markReviewed(selectedSession.id, reviewNotes || undefined);
      setReviewNotes('');
    } finally {
      setIsUpdatingReview(false);
    }
  };

  const handleMarkUnreviewed = async () => {
    if (!selectedSession) return;
    setIsUpdatingReview(true);
    try {
      await markUnreviewed(selectedSession.id);
    } finally {
      setIsUpdatingReview(false);
    }
  };

  const handleAddTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSession || !newTag.trim()) return;
    setIsAddingTag(true);
    try {
      await addTag(selectedSession.id, newTag.trim());
      setNewTag('');
    } finally {
      setIsAddingTag(false);
    }
  };

  const handleRemoveTag = async (tag: string) => {
    if (!selectedSession) return;
    setRemovingTag(tag);
    try {
      await removeTag(selectedSession.id, tag);
    } finally {
      setRemovingTag(null);
    }
  };

  const getRiskColor = (level: string | null) => {
    switch (level) {
      case 'critical': return 'bg-red-900/50 text-red-400 border-red-700';
      case 'high': return 'bg-orange-900/50 text-orange-400 border-orange-700';
      case 'medium': return 'bg-yellow-900/50 text-yellow-400 border-yellow-700';
      default: return 'bg-green-900/50 text-green-400 border-green-700';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error || !selectedSession) {
    return (
      <div className="bg-slate-800 rounded-xl shadow-lg shadow-black/20 p-12 text-center">
        <p className="text-slate-400">{error || 'Session not found'}</p>
        <button
          onClick={() => navigate('/sessions')}
          className="mt-4 text-primary-400 hover:text-primary-300"
        >
          Back to Sessions
        </button>
      </div>
    );
  }

  const session = selectedSession;

  return (
    <div className="space-y-4">
      {/* Compact Header with Back Button */}
      <div className="bg-slate-800 rounded-xl shadow-lg shadow-black/20 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/sessions')}
              className="flex items-center gap-1 text-slate-400 hover:text-slate-200 text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>
            <div className="h-4 w-px bg-slate-700" />
            <div>
              <h1 className="text-lg font-semibold text-slate-100">
                {session.servers?.name || session.server_name || 'Session Details'}
              </h1>
              <div className="flex items-center gap-1.5">
                <p className="text-xs text-slate-500 font-mono">{session.id}</p>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(session.id);
                  }}
                  className="p-0.5 text-slate-500 hover:text-slate-300 transition-colors"
                  title="Copy session ID"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-2 py-1 text-xs font-medium rounded capitalize ${
              session.status === 'active' ? 'bg-green-900/50 text-green-400' :
              session.status === 'error' ? 'bg-red-900/50 text-red-400' :
              'bg-slate-700 text-slate-400'
            }`}>
              {session.status}
            </span>
            {session.reviewed && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-green-900/50 text-green-400 text-xs font-medium">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Reviewed
              </span>
            )}
            {session.risk_level && (
              <span className={`px-2 py-1 rounded text-xs font-semibold capitalize ${getRiskColor(session.risk_level)}`}>
                {session.risk_level}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main Info Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left Column: Session Info + Activity (Combined) */}
        <div className="lg:col-span-4 bg-slate-800 rounded-xl shadow-lg shadow-black/20 overflow-hidden">
          {/* Session Info */}
          <div className="p-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div>
                <dt className="text-[11px] text-slate-500 uppercase tracking-wider mb-0.5">Server</dt>
                <dd className="font-medium text-slate-200 truncate">
                  {session.servers?.name ? (
                    <span
                      className="hover:text-blue-400 cursor-pointer transition-colors"
                      onClick={() => navigate(`/servers?search=${encodeURIComponent(session.servers?.host || session.servers?.name || '')}`)}
                    >
                      {session.servers.name}
                    </span>
                  ) : (
                    <span className="text-slate-400">{session.server_name || '-'}</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-slate-500 uppercase tracking-wider mb-0.5">Protocol</dt>
                <dd className="font-medium text-slate-200 uppercase">{session.servers?.protocol || session.server_protocol || '-'}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-slate-500 uppercase tracking-wider mb-0.5">User</dt>
                <dd className="font-medium text-slate-200 truncate">
                  {session.user?.display_name || session.user?.username ? (
                    <span
                      className="hover:text-blue-400 cursor-pointer transition-colors"
                      onClick={() => navigate(`/users?search=${encodeURIComponent(session.user?.username || session.user?.display_name || '')}`)}
                    >
                      {session.user?.display_name || session.user?.username}
                    </span>
                  ) : '-'}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-slate-500 uppercase tracking-wider mb-0.5">Started</dt>
                <dd className="font-medium text-slate-200">{format(new Date(session.started_at), 'MMM d, HH:mm')}</dd>
              </div>
              {session.ended_at && (
                <div className="col-span-2">
                  <dt className="text-[11px] text-slate-500 uppercase tracking-wider mb-0.5">Duration</dt>
                  <dd className="font-medium text-slate-200">
                    {(() => {
                      const diff = Math.floor((new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 1000);
                      if (diff < 60) return `${diff}s`;
                      if (diff < 3600) return `${Math.floor(diff / 60)}m ${diff % 60}s`;
                      return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`;
                    })()}
                  </dd>
                </div>
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-slate-700/50"></div>

          {/* Activity & Playback */}
          <div className="p-4 bg-slate-800/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-slate-700/50 flex items-center justify-center">
                  <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-100">{session.keystroke_count || 0}</p>
                  <p className="text-[11px] text-slate-500 uppercase tracking-wider">Keystrokes</p>
                </div>
              </div>
              {session.guac_recording_url && (
                <button
                  onClick={handlePlayRecording}
                  disabled={loadingRecording}
                  className="px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 disabled:opacity-50 flex items-center gap-2 text-sm font-medium transition-colors shadow-lg shadow-emerald-900/30"
                >
                  {loadingRecording ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                  ) : (
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  )}
                  Play
                </button>
              )}
            </div>
            {recordingError && <p className="text-xs text-red-400 mt-2">{recordingError}</p>}
          </div>
        </div>

        {/* Right Column: Review & Tags */}
        <div className="lg:col-span-8 bg-slate-800 rounded-xl shadow-lg shadow-black/20 p-4 space-y-4">
          {/* Review Section */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-md bg-slate-700/50 flex items-center justify-center">
                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </div>
              <span className="text-sm font-medium text-slate-300">Auditor Review</span>
            </div>
            {session.reviewed ? (
              <div className="bg-green-900/20 border border-green-800/50 rounded-lg p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-green-600/30 flex items-center justify-center">
                      <svg className="w-4 h-4 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-green-400">Reviewed</p>
                      <p className="text-xs text-slate-400">by {session.reviewer?.display_name || session.reviewer?.username || 'Unknown'}</p>
                    </div>
                  </div>
                  <button
                    onClick={handleMarkUnreviewed}
                    disabled={isUpdatingReview}
                    className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    Undo
                  </button>
                </div>
                {session.review_notes && (
                  <div className="mt-3 p-3 bg-slate-800/50 rounded-lg border border-green-800/30">
                    <p className="text-xs text-slate-400 mb-1">Review Notes:</p>
                    <p className="text-sm text-slate-200 whitespace-pre-wrap">{session.review_notes}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="Write your review notes here... Describe what you observed, any concerns, recommendations, or conclusions about this session."
                  rows={3}
                  className="w-full px-3 py-3 text-sm border border-slate-700 bg-slate-900/50 text-slate-100 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-500 focus:border-slate-500 placeholder-slate-600 transition-all resize-none"
                />
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-600">Optional notes for audit trail</p>
                  <button
                    onClick={handleMarkReviewed}
                    disabled={isUpdatingReview}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-500 disabled:opacity-50 flex items-center gap-2 text-sm font-medium transition-colors shadow-lg shadow-green-900/30"
                  >
                    {isUpdatingReview ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Mark as Reviewed
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="border-t border-slate-700/50"></div>

          {/* Tags Section */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-md bg-slate-700/50 flex items-center justify-center">
                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
              </div>
              <span className="text-sm font-medium text-slate-300">Tags</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {session.tags && session.tags.length > 0 ? (
                session.tags.map((tag, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-slate-700 text-slate-200 rounded-full border border-slate-600 hover:border-slate-500 transition-colors group"
                  >
                    {tag}
                    <button
                      onClick={() => handleRemoveTag(tag)}
                      disabled={removingTag === tag}
                      className="text-slate-500 hover:text-red-400 transition-colors"
                    >
                      {removingTag === tag ? (
                        <div className="w-3 h-3 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></div>
                      ) : (
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      )}
                    </button>
                  </span>
                ))
              ) : (
                <span className="text-xs text-slate-500 italic">No tags</span>
              )}
              <form onSubmit={handleAddTag} className="inline-flex">
                <div className="relative">
                  <input
                    type="text"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    placeholder="Add tag..."
                    maxLength={24}
                    className="w-20 px-2.5 py-1 text-xs border border-dashed border-slate-600 bg-transparent text-slate-100 rounded-full focus:outline-none focus:border-primary-500 focus:w-28 transition-all placeholder-slate-500 hover:border-slate-500"
                  />
                  {isAddingTag && (
                    <div className="absolute right-2 top-1/2 -translate-y-1/2">
                      <div className="w-3 h-3 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                  )}
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>

      {/* AI Analysis with MITRE ATT&CK integrated */}
      {(session.ai_summary || session.privilege_escalation || session.data_exfiltration ||
        session.persistence || session.lateral_movement || session.credential_access || session.defense_evasion) && (
        <div className="bg-slate-800 rounded-xl shadow-lg shadow-black/20 overflow-hidden">
          {/* AI Analysis Section */}
          {session.ai_summary && (
            <div className="p-4">
              <div className="flex items-start gap-3">
                {/* AI Icon */}
                <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-gradient-to-br from-purple-900/60 to-purple-800/40 border border-purple-700/50 flex items-center justify-center">
                  <svg className="w-4.5 h-4.5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <h3 className="text-sm font-semibold text-slate-200">AI Analysis</h3>
                    <span className="px-1.5 py-0.5 text-[10px] font-medium bg-purple-900/50 text-purple-300 rounded">AUTO</span>
                  </div>
                  {(() => {
                    let summary = session.ai_summary;
                    try {
                      if (typeof summary === 'string' && summary.startsWith('{')) {
                        const parsed = JSON.parse(summary);
                        summary = parsed.summary || summary;
                      }
                    } catch {
                      // Keep original
                    }
                    return <p className="text-sm text-slate-400 leading-relaxed">{summary}</p>;
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* MITRE ATT&CK Badges - Integrated */}
          {(session.privilege_escalation || session.data_exfiltration || session.persistence ||
            session.lateral_movement || session.credential_access || session.defense_evasion) && (
            <div className={`px-4 py-3 bg-slate-900/40 border-t border-slate-700/50`}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider mr-1">MITRE ATT&CK</span>
                {session.privilege_escalation && (
                  <span className="px-2 py-1 text-xs font-medium bg-red-900/40 text-red-400 border border-red-800/50 rounded">
                    Privilege Escalation <span className="text-red-500/60 ml-0.5">TA0004</span>
                  </span>
                )}
                {session.data_exfiltration && (
                  <span className="px-2 py-1 text-xs font-medium bg-red-900/40 text-red-400 border border-red-800/50 rounded">
                    Data Exfiltration <span className="text-red-500/60 ml-0.5">TA0010</span>
                  </span>
                )}
                {session.persistence && (
                  <span className="px-2 py-1 text-xs font-medium bg-orange-900/40 text-orange-400 border border-orange-800/50 rounded">
                    Persistence <span className="text-orange-500/60 ml-0.5">TA0003</span>
                  </span>
                )}
                {session.lateral_movement && (
                  <span className="px-2 py-1 text-xs font-medium bg-orange-900/40 text-orange-400 border border-orange-800/50 rounded">
                    Lateral Movement <span className="text-orange-500/60 ml-0.5">TA0008</span>
                  </span>
                )}
                {session.credential_access && (
                  <span className="px-2 py-1 text-xs font-medium bg-red-900/40 text-red-400 border border-red-800/50 rounded">
                    Credential Access <span className="text-red-500/60 ml-0.5">TA0006</span>
                  </span>
                )}
                {session.defense_evasion && (
                  <span className="px-2 py-1 text-xs font-medium bg-purple-900/40 text-purple-400 border border-purple-800/50 rounded">
                    Defense Evasion <span className="text-purple-500/60 ml-0.5">TA0005</span>
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Not Analyzed Message - Show when session is completed but not analyzed */}
      {session.status === 'disconnected' && !session.ai_summary && !session.risk_level && (
        <div className="bg-slate-800 rounded-xl shadow-lg shadow-black/20 p-5">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-slate-700/50 border border-slate-600/50 flex items-center justify-center">
              <svg className="w-4.5 h-4.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-slate-400 mb-1">Not Analyzed</h3>
              <p className="text-sm text-slate-500">
                This session has not been analyzed by AI. Auto-analysis may be disabled, or analysis is still pending.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Findings with MITRE Technique IDs */}
      {session.findings && session.findings.length > 0 && (
        <div className="bg-slate-800 rounded-xl shadow-lg shadow-black/20 p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-red-900/60 to-orange-900/40 border border-red-800/50 flex items-center justify-center">
              <svg className="w-4.5 h-4.5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-slate-100">Detailed Findings</h2>
              <span className="px-2 py-0.5 text-xs font-medium bg-slate-700 text-slate-300 rounded-full">
                {session.findings.length}
              </span>
            </div>
          </div>
          <div className="space-y-4">
            {session.findings.map((finding: any, index: number) => (
              <div
                key={index}
                className={`border rounded-lg p-4 ${
                  finding.severity === 'critical' ? 'border-red-700 bg-red-900/30' :
                  finding.severity === 'high' ? 'border-orange-700 bg-orange-900/30' :
                  finding.severity === 'medium' ? 'border-yellow-700 bg-yellow-900/30' :
                  finding.severity === 'low' ? 'border-blue-700 bg-blue-900/30' :
                  'border-slate-700 bg-slate-700/50'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 text-xs font-medium rounded uppercase ${
                      finding.severity === 'critical' ? 'bg-red-800 text-red-200' :
                      finding.severity === 'high' ? 'bg-orange-800 text-orange-200' :
                      finding.severity === 'medium' ? 'bg-yellow-800 text-yellow-200' :
                      finding.severity === 'low' ? 'bg-blue-800 text-blue-200' :
                      'bg-slate-600 text-slate-200'
                    }`}>
                      {finding.severity}
                    </span>
                    <span className="text-sm text-slate-400">{finding.id}</span>
                  </div>
                  {finding.mitreTechniqueId && (
                    <a
                      href={`https://attack.mitre.org/techniques/${finding.mitreTechniqueId.replace('.', '/')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs px-2 py-1 bg-purple-900/50 text-purple-300 border border-purple-700 rounded hover:bg-purple-800/50 transition-colors"
                    >
                      {finding.mitreTechniqueId}
                      {finding.mitreTechniqueName && ` - ${finding.mitreTechniqueName}`}
                    </a>
                  )}
                </div>
                <h3 className="font-medium text-slate-100 mt-2">{finding.title}</h3>
                {finding.description && (
                  <p className="text-sm text-slate-300 mt-1">{finding.description}</p>
                )}
                {finding.evidence && (
                  <div className="mt-2 p-2 bg-slate-900/50 rounded border border-slate-600">
                    <span className="text-xs text-slate-400">Evidence:</span>
                    <code className="block text-xs text-slate-300 mt-1 font-mono whitespace-pre-wrap">
                      {finding.evidence}
                    </code>
                  </div>
                )}
                {finding.commandRiskScore !== undefined && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs text-slate-400">Risk Score:</span>
                    <div className="flex-1 h-2 bg-slate-700 rounded-full max-w-[100px]">
                      <div
                        className={`h-full rounded-full ${
                          finding.commandRiskScore >= 8 ? 'bg-red-500' :
                          finding.commandRiskScore >= 6 ? 'bg-orange-500' :
                          finding.commandRiskScore >= 4 ? 'bg-yellow-500' :
                          'bg-green-500'
                        }`}
                        style={{ width: `${finding.commandRiskScore * 10}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium text-slate-300">{finding.commandRiskScore}/10</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Indicators of Compromise */}
      {session.indicators && (
        (session.indicators.ipAddresses?.length > 0 ||
         session.indicators.domains?.length > 0 ||
         session.indicators.fileHashes?.length > 0 ||
         session.indicators.urls?.length > 0 ||
         session.indicators.userAccounts?.length > 0) && (
        <div className="bg-slate-800 rounded-xl shadow-lg shadow-black/20 p-6">
          <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Indicators of Compromise (IoCs)
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {session.indicators.ipAddresses?.length > 0 && (
              <div className="bg-slate-700/50 rounded-lg p-4">
                <h3 className="text-sm font-medium text-slate-300 mb-2">IP Addresses</h3>
                <div className="space-y-1">
                  {session.indicators.ipAddresses.map((ip: string, idx: number) => (
                    <code key={idx} className="block text-xs bg-slate-900 text-slate-300 px-2 py-1 rounded border border-slate-600 font-mono">
                      {ip}
                    </code>
                  ))}
                </div>
              </div>
            )}
            {session.indicators.domains?.length > 0 && (
              <div className="bg-slate-700/50 rounded-lg p-4">
                <h3 className="text-sm font-medium text-slate-300 mb-2">Domains</h3>
                <div className="space-y-1">
                  {session.indicators.domains.map((domain: string, idx: number) => (
                    <code key={idx} className="block text-xs bg-slate-900 text-slate-300 px-2 py-1 rounded border border-slate-600 font-mono">
                      {domain}
                    </code>
                  ))}
                </div>
              </div>
            )}
            {session.indicators.urls?.length > 0 && (
              <div className="bg-slate-700/50 rounded-lg p-4">
                <h3 className="text-sm font-medium text-slate-300 mb-2">URLs</h3>
                <div className="space-y-1">
                  {session.indicators.urls.map((url: string, idx: number) => (
                    <code key={idx} className="block text-xs bg-slate-900 text-slate-300 px-2 py-1 rounded border border-slate-600 font-mono break-all">
                      {url}
                    </code>
                  ))}
                </div>
              </div>
            )}
            {session.indicators.fileHashes?.length > 0 && (
              <div className="bg-slate-700/50 rounded-lg p-4">
                <h3 className="text-sm font-medium text-slate-300 mb-2">File Hashes</h3>
                <div className="space-y-1">
                  {session.indicators.fileHashes.map((hash: string, idx: number) => (
                    <code key={idx} className="block text-xs bg-slate-900 text-slate-300 px-2 py-1 rounded border border-slate-600 font-mono break-all">
                      {hash}
                    </code>
                  ))}
                </div>
              </div>
            )}
            {session.indicators.userAccounts?.length > 0 && (
              <div className="bg-slate-700/50 rounded-lg p-4">
                <h3 className="text-sm font-medium text-slate-300 mb-2">User Accounts</h3>
                <div className="space-y-1">
                  {session.indicators.userAccounts.map((account: string, idx: number) => (
                    <code key={idx} className="block text-xs bg-slate-900 text-slate-300 px-2 py-1 rounded border border-slate-600 font-mono">
                      {account}
                    </code>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ))}

      {/* Playback Modal - Portal to ensure it covers entire viewport */}
      {showPlayback && recordingUrl && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-sm"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
          onClick={handleClosePlayback}
        >
          <div
            className="w-full max-w-6xl mx-4 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <SessionPlayback
              recordingUrl={recordingUrl}
              onClose={handleClosePlayback}
              onError={(err) => {
                setRecordingError(err);
                setShowPlayback(false);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
