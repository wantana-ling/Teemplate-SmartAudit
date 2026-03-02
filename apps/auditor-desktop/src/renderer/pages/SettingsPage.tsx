import { useState, useEffect } from 'react';
import { api } from '../services/api';

interface AuditLogEntry {
  id: string;
  action: string;
  actor_id: string;
  actor_name?: string;
  resource_type?: string;
  resource_id?: string;
  resource_name?: string;
  details?: Record<string, any>;
  ip_address?: string;
  created_at: string;
}

interface SystemSettings {
  recording_retention_days?: string;
  auto_analyze_sessions?: string;
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('general');

  // General settings state
  const [settings, setSettings] = useState<SystemSettings>({});
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsSaving, setSavingSettings] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // IP Server state
  const [apiServerUrl, setApiServerUrl] = useState(api.getBaseUrl().replace(/^https?:\/\//, ''));
  const [apiTesting, setApiTesting] = useState(false);
  const [apiMessage, setApiMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Audit log state
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditOffset, setAuditOffset] = useState(0);
  const [hasMoreLogs, setHasMoreLogs] = useState(true);
  const AUDIT_PAGE_SIZE = 20;

  const tabs = [
    { id: 'general', label: 'General' },
    { id: 'api', label: 'IP Server' },
    { id: 'audit', label: 'Audit Log' },
  ];

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  // Load audit logs when tab is selected
  useEffect(() => {
    if (activeTab === 'audit' && auditLogs.length === 0) {
      loadAuditLogs();
    }
  }, [activeTab]);

  const loadSettings = async () => {
    setSettingsLoading(true);
    try {
      const response = await api.getSettings();
      if (response.success && response.data) {
        setSettings(response.data as SystemSettings);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setSettingsLoading(false);
    }
  };

  // Immediately save a single setting (for toggles)
  const saveToggleSetting = async (key: string, value: string) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    try {
      const response = await api.updateSettings({ [key]: value });
      if (!response.success) {
        // Revert on failure
        setSettings(settings);
        setSettingsMessage({ type: 'error', text: response.error || `Failed to save ${key}` });
        setTimeout(() => setSettingsMessage(null), 3000);
      }
    } catch {
      setSettings(settings);
    }
  };

  const saveSettings = async () => {
    setSavingSettings(true);
    setSettingsMessage(null);
    try {
      const response = await api.updateSettings(settings);
      if (response.success) {
        setSettingsMessage({ type: 'success', text: 'Settings saved successfully' });
      } else {
        setSettingsMessage({ type: 'error', text: response.error || 'Failed to save settings' });
      }
    } catch (error: any) {
      setSettingsMessage({ type: 'error', text: error.message || 'Failed to save settings' });
    } finally {
      setSavingSettings(false);
      setTimeout(() => setSettingsMessage(null), 3000);
    }
  };


  const loadAuditLogs = async (offset = 0) => {
    setAuditLoading(true);
    try {
      const response = await api.getAuditLog({ limit: AUDIT_PAGE_SIZE, offset });
      if (response.success && response.data) {
        const logs = response.data as AuditLogEntry[];
        if (offset === 0) {
          setAuditLogs(logs);
        } else {
          setAuditLogs(prev => [...prev, ...logs]);
        }
        setHasMoreLogs(logs.length === AUDIT_PAGE_SIZE);
        setAuditOffset(offset);
      }
    } catch (error) {
      console.error('Failed to load audit logs:', error);
    } finally {
      setAuditLoading(false);
    }
  };

  const loadMoreLogs = () => {
    loadAuditLogs(auditOffset + AUDIT_PAGE_SIZE);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const formatAction = (action: string) => {
    // Shorten certain action names
    const shortNames: Record<string, string> = {
      'session_reviewed': 'Reviewed',
      'session_unreviewed': 'Unreviewed',
      'session_terminated': 'Terminated',
      'session_reanalyzed': 'Reanalyzed',
      'user_banned': 'Banned',
      'user_unbanned': 'Unbanned',
      'login_success': 'Login',
      'login_failed': 'Login Failed',
      'password_changed': 'Password Changed',
      'user_created': 'Created',
      'user_updated': 'Updated',
      'user_deleted': 'Deleted',
      'user_enabled': 'Enabled',
      'user_disabled': 'Disabled',
      'server_created': 'Created',
      'server_updated': 'Updated',
      'server_deleted': 'Deleted',
      'server_enabled': 'Enabled',
      'server_disabled': 'Disabled',
      'access_granted': 'Access Granted',
      'access_revoked': 'Access Revoked',
      'group_created': 'Created',
      'group_updated': 'Updated',
      'group_deleted': 'Deleted',
      'group_member_added': 'Member Added',
      'group_member_removed': 'Member Removed',
      'settings_updated': 'Settings Changed',
      'tag_added': 'Tag Added',
      'tag_removed': 'Tag Removed',
    };
    return shortNames[action] || action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  const getActionBadgeColor = (action: string) => {
    if (action.includes('delete') || action.includes('ban') || action.includes('terminate') || action.includes('failed') || action.includes('disabled')) {
      return 'bg-red-900/50 text-red-400 border border-red-800/50';
    }
    if (action.includes('create') || action.includes('grant') || action.includes('success') || action.includes('added') || action.includes('enabled')) {
      return 'bg-green-900/50 text-green-400 border border-green-800/50';
    }
    if (action.includes('update') || action.includes('change')) {
      return 'bg-yellow-900/50 text-yellow-400 border border-yellow-800/50';
    }
    if (action.includes('review')) {
      return 'bg-blue-900/50 text-blue-400 border border-blue-800/50';
    }
    if (action.includes('revoke') || action.includes('removed') || action.includes('unban')) {
      return 'bg-orange-900/50 text-orange-400 border border-orange-800/50';
    }
    return 'bg-slate-700/50 text-slate-300 border border-slate-600/50';
  };

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="bg-slate-800 rounded-xl shadow-lg shadow-black/20 border border-slate-700">
        <div className="border-b border-slate-700">
          <nav className="flex -mb-px">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-primary-500 text-primary-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {/* General Tab */}
          {activeTab === 'general' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-slate-100 mb-4">System Settings</h3>

                {settingsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Recording Retention */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-slate-100">Recording Retention</p>
                        <p className="text-sm text-slate-400">
                          How long to keep session recordings (applies to new recordings only)
                        </p>
                      </div>
                      <select
                        value={settings.recording_retention_days || '90'}
                        onChange={(e) => setSettings({ ...settings, recording_retention_days: e.target.value })}
                        className="px-4 py-2 border border-slate-600 rounded-lg bg-slate-700 text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      >
                        <option value="30">30 days</option>
                        <option value="60">60 days</option>
                        <option value="90">90 days</option>
                        <option value="180">180 days</option>
                        <option value="365">1 year</option>
                        <option value="0">Forever</option>
                      </select>
                    </div>

                    {/* Auto-analyze Sessions */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-slate-100">Auto-analyze Sessions</p>
                        <p className="text-sm text-slate-400">
                          Automatically run AI analysis on completed sessions
                        </p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={settings.auto_analyze_sessions === 'true'}
                          onChange={(e) => saveToggleSetting('auto_analyze_sessions', e.target.checked ? 'true' : 'false')}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-slate-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-500 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                      </label>
                    </div>

                    {/* Info about AI disabled */}
                    {settings.auto_analyze_sessions !== 'true' && (
                      <div className="mt-4 p-3 bg-slate-700/50 rounded-lg border border-slate-600">
                        <p className="text-sm text-slate-400">
                          <span className="text-yellow-400 font-medium">Note:</span> When auto-analyze is disabled,
                          sessions will still be recorded and viewable. Risk analysis fields will show as "Not analyzed"
                          until manually triggered.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Save Button & Message */}
              <div className="pt-4 flex items-center gap-4">
                <button
                  onClick={saveSettings}
                  disabled={settingsSaving || settingsLoading}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {settingsSaving && (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  )}
                  Save Changes
                </button>
                {settingsMessage && (
                  <p className={`text-sm ${settingsMessage.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                    {settingsMessage.text}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* IP Server Tab */}
          {activeTab === 'api' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-slate-100 mb-4">IP Server Configuration</h3>
                <p className="text-sm text-slate-400 mb-6">
                  Configure the backend IP server that this application connects to.
                </p>

                <div className="space-y-4 max-w-lg">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">
                      IP Server
                    </label>
                    <input
                      type="text"
                      value={apiServerUrl}
                      onChange={(e) => setApiServerUrl(e.target.value)}
                      placeholder="192.168.1.100:8080"
                      className="w-full px-4 py-2 border border-slate-600 rounded-lg bg-slate-700 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm"
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      Default: {api.getDefaultUrl().replace(/^https?:\/\//, '')}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <button
                      onClick={async () => {
                        setApiTesting(true);
                        setApiMessage(null);
                        try {
                          const ip = apiServerUrl.replace(/\/+$/, '');
                          const url = ip.startsWith('http') ? ip : `http://${ip}`;
                          const res = await fetch(`${url}/api/health`, { method: 'GET' }).catch(() => null);
                          if (res && res.ok) {
                            setApiMessage({ type: 'success', text: 'Connection successful!' });
                          } else {
                            setApiMessage({ type: 'error', text: 'Cannot connect to server' });
                          }
                        } catch {
                          setApiMessage({ type: 'error', text: 'Cannot connect to server' });
                        } finally {
                          setApiTesting(false);
                        }
                      }}
                      disabled={apiTesting || !apiServerUrl.trim()}
                      className="px-4 py-2 bg-slate-600 text-slate-200 rounded-lg hover:bg-slate-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm"
                    >
                      {apiTesting && (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      )}
                      Test Connection
                    </button>
                    <button
                      onClick={() => {
                        const ip = apiServerUrl.replace(/\/+$/, '');
                        const url = ip.startsWith('http') ? ip : `http://${ip}`;
                        api.setBaseUrl(url);
                        setApiMessage({ type: 'success', text: 'IP Server saved. Reload to apply.' });
                        setTimeout(() => setApiMessage(null), 5000);
                      }}
                      disabled={!apiServerUrl.trim()}
                      className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => {
                        setApiServerUrl(api.getDefaultUrl().replace(/^https?:\/\//, ''));
                        api.setBaseUrl(api.getDefaultUrl());
                        setApiMessage({ type: 'success', text: 'Reset to default. Reload to apply.' });
                        setTimeout(() => setApiMessage(null), 5000);
                      }}
                      className="px-4 py-2 text-slate-400 hover:text-slate-200 text-sm"
                    >
                      Reset to Default
                    </button>
                  </div>

                  {apiMessage && (
                    <p className={`text-sm ${apiMessage.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                      {apiMessage.text}
                    </p>
                  )}
                </div>
              </div>

              {/* Current connection info */}
              <div className="mt-6 p-4 bg-slate-700/30 rounded-lg border border-slate-700/50">
                <h4 className="text-sm font-medium text-slate-300 mb-2">Current Connection</h4>
                <div className="space-y-1">
                  <p className="text-xs text-slate-400">
                    <span className="text-slate-500">Active IP:</span>{' '}
                    <span className="font-mono text-slate-300">{api.getBaseUrl().replace(/^https?:\/\//, '')}</span>
                  </p>
                  <p className="text-xs text-slate-400">
                    <span className="text-slate-500">Default IP:</span>{' '}
                    <span className="font-mono text-slate-300">{api.getDefaultUrl().replace(/^https?:\/\//, '')}</span>
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Audit Log Tab */}
          {activeTab === 'audit' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-slate-100">Audit Log</h3>
                <button
                  onClick={() => loadAuditLogs(0)}
                  disabled={auditLoading}
                  className="px-3 py-1.5 text-sm bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 disabled:opacity-50"
                >
                  Refresh
                </button>
              </div>

              {/* Info banner */}
              <div className="px-3 py-2 bg-slate-700/30 rounded-lg border border-slate-700/50">
                <p className="text-xs text-slate-400">
                  This log records all administrative actions for compliance and security auditing.
                  All entries are immutable and timestamped.
                </p>
              </div>

              <div className="border border-slate-700 rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-slate-900">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase w-44">
                        Time
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase w-28">
                        Actor
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase w-36">
                        Action
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">
                        Target
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700">
                    {auditLoading && auditLogs.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center">
                          <div className="flex items-center justify-center">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-500"></div>
                          </div>
                        </td>
                      </tr>
                    ) : auditLogs.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                          No audit log entries found
                        </td>
                      </tr>
                    ) : (
                      auditLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-700/50">
                          <td className="px-4 py-3 text-sm text-slate-400">
                            {formatDate(log.created_at)}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <span className="text-slate-200 font-medium">
                              {log.actor_name || 'System'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded ${getActionBadgeColor(log.action)}`}>
                              {formatAction(log.action)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {log.resource_name ? (
                              <span className="text-slate-300">{log.resource_name}</span>
                            ) : log.resource_type ? (
                              <span className="text-slate-500 capitalize">{log.resource_type}</span>
                            ) : (
                              <span className="text-slate-600">-</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Load More */}
              {hasMoreLogs && auditLogs.length > 0 && (
                <div className="flex justify-center pt-2">
                  <button
                    onClick={loadMoreLogs}
                    disabled={auditLoading}
                    className="px-4 py-2 text-sm bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 disabled:opacity-50 flex items-center gap-2"
                  >
                    {auditLoading && (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-slate-300"></div>
                    )}
                    Load More
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
