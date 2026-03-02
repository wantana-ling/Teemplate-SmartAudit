import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useServerStore, Server } from '../stores/serverStore';
import { api } from '../services/api';

interface User {
  id: string;
  username: string;
  display_name: string;
  role: string;
  avatar_color: string;
}

interface Group {
  id: string;
  name: string;
  color: string;
  member_count: number;
}

interface ServerAccess {
  id: string;
  server_id: string;
  user_id: string | null;
  group_id: string | null;
  user?: User;
  group?: Group;
  granted_at: string;
}

export default function ServersPage() {
  const [searchParams] = useSearchParams();
  const { servers, loading, error, fetchServers, createServer, updateServer, deleteServer } = useServerStore();
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [showModal, setShowModal] = useState(false);
  const [editingServer, setEditingServer] = useState<Server | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    host: '',
    port: 22,
    protocol: 'ssh' as 'ssh' | 'rdp' | 'vnc',
    username: '',
    password: '',
    description: '',
    department: [] as string[],
  });
  const [departments, setDepartments] = useState<string[]>([]);

  // Access management state
  const [showAccessModal, setShowAccessModal] = useState<Server | null>(null);
  const [serverAccess, setServerAccess] = useState<ServerAccess[]>([]);
  const [loadingAccess, setLoadingAccess] = useState(false);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [allGroups, setAllGroups] = useState<Group[]>([]);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [showAddUserDropdown, setShowAddUserDropdown] = useState(false);
  const [showAddGroupDropdown, setShowAddGroupDropdown] = useState(false);
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  // Fetch departments from groups for the dropdown
  useEffect(() => {
    const loadDepartments = async () => {
      try {
        const res = await api.getGroups();
        if (res.success && Array.isArray(res.data)) {
          const names = (res.data as any[])
            .map((g: any) => g.name)
            .filter(Boolean);
          setDepartments(Array.from(new Set(names)).sort());
        }
      } catch (err) {
        console.error('Failed to load departments:', err);
      }
    };
    loadDepartments();
  }, []);

  // Initial fetch on mount - use URL params if present
  useEffect(() => {
    const initialSearch = searchParams.get('search') || '';
    fetchServers({ search: initialSearch || undefined });
    setTimeout(() => setInitialLoadDone(true), 350);
  }, []);

  // Debounced search - skip on initial load to prevent overwriting URL param results
  useEffect(() => {
    if (!initialLoadDone) return;

    const timer = setTimeout(() => {
      fetchServers({ search: search || undefined });
    }, 300);
    return () => clearTimeout(timer);
  }, [search, fetchServers, initialLoadDone]);

  // Access management functions
  const loadServerAccess = async (serverId: string) => {
    try {
      setLoadingAccess(true);
      setAccessError(null);
      const response = await api.getServerAccess(serverId);
      if (response.success) {
        setServerAccess((response.data as ServerAccess[]) || []);
      } else {
        setAccessError(response.error || 'Failed to load access');
      }
    } catch (err: any) {
      setAccessError(err.message);
    } finally {
      setLoadingAccess(false);
    }
  };

  const loadUsersAndGroups = async () => {
    try {
      const [usersRes, groupsRes] = await Promise.all([
        api.get('/api/users'),
        api.get('/api/groups'),
      ]);
      if (usersRes.success) {
        // Filter to only show clients (they need access)
        setAllUsers((usersRes.data || []).filter((u: User) => u.role === 'client'));
      }
      if (groupsRes.success) {
        setAllGroups(groupsRes.data || []);
      }
    } catch (err: any) {
      console.error('Failed to load users/groups:', err);
    }
  };

  const handleGrantUserAccess = async (serverId: string, userId: string) => {
    try {
      const response = await api.grantUserServerAccess(serverId, userId);
      if (response.success) {
        loadServerAccess(serverId);
        setShowAddUserDropdown(false);
      } else {
        setAccessError(response.error || 'Failed to grant access');
      }
    } catch (err: any) {
      setAccessError(err.message);
    }
  };

  const handleGrantGroupAccess = async (serverId: string, groupId: string) => {
    try {
      const response = await api.grantGroupServerAccess(serverId, groupId);
      if (response.success) {
        loadServerAccess(serverId);
        setShowAddGroupDropdown(false);
      } else {
        setAccessError(response.error || 'Failed to grant access');
      }
    } catch (err: any) {
      setAccessError(err.message);
    }
  };

  const handleRevokeAccess = async (serverId: string, accessId: string) => {
    try {
      const response = await api.revokeServerAccess(serverId, accessId);
      if (response.success) {
        loadServerAccess(serverId);
      } else {
        setAccessError(response.error || 'Failed to revoke access');
      }
    } catch (err: any) {
      setAccessError(err.message);
    }
  };

  const deptRef = useRef<string[]>([]);

  const openAccessModal = (server: Server) => {
    deptRef.current = Array.isArray(server.department) ? [...server.department] : [];
    setShowAccessModal(server);
    setAccessError(null);
    loadServerAccess(server.id);
    loadUsersAndGroups();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingServer) {
      await updateServer(editingServer.id, formData);
    } else {
      await createServer(formData);
    }
    setShowModal(false);
    setEditingServer(null);
    resetForm();
  };

  const resetForm = () => {
    setFormData({
      name: '',
      host: '',
      port: 22,
      protocol: 'ssh',
      username: '',
      password: '',
      description: '',
      department: [],
    });
  };

  const handleEdit = (server: Server) => {
    setEditingServer(server);
    setFormData({
      name: server.name,
      host: server.host,
      port: server.port,
      protocol: server.protocol,
      username: server.username || '',
      password: '',
      description: server.description || '',
      department: server.department || [],
    });
    setShowModal(true);
  };

  const handleDelete = async (server: Server) => {
    if (confirm(`Are you sure you want to delete server "${server.name}"?`)) {
      await deleteServer(server.id);
    }
  };

  const handleToggleEnabled = async (server: Server) => {
    await updateServer(server.id, { enabled: !server.enabled });
  };

  const getProtocolIcon = (protocol: string) => {
    switch (protocol) {
      case 'ssh':
        return (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        );
      case 'rdp':
        return (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        );
      case 'vnc':
        return (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        );
      default:
        return (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
          </svg>
        );
    }
  };

  const getProtocolColor = (protocol: string) => {
    switch (protocol) {
      case 'ssh': return 'bg-green-900/50 text-green-400 border border-green-700';
      case 'rdp': return 'bg-blue-900/50 text-blue-400 border border-blue-700';
      case 'vnc': return 'bg-purple-900/50 text-purple-400 border border-purple-700';
      default: return 'bg-slate-700 text-slate-400 border border-slate-600';
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <p className="text-slate-400">Configure remote servers for client access</p>
          {!loading && (
            <span className="px-2 py-0.5 text-xs font-medium bg-slate-700 text-slate-300 rounded-full">
              {servers.length} servers
            </span>
          )}
        </div>
        <button
          onClick={() => {
            setEditingServer(null);
            resetForm();
            setShowModal(true);
          }}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors flex items-center gap-2 shadow-lg shadow-primary-900/30"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Server
        </button>
      </div>

      {/* Search */}
      <div className="bg-slate-800 rounded-xl shadow-lg shadow-black/20 p-4">
        <div className="relative">
          <input
            type="text"
            placeholder="Search servers by name or host"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-600 bg-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent placeholder-slate-500"
          />
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-4">
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {/* Servers Grid */}
      <div className="bg-slate-800 rounded-xl shadow-lg shadow-black/20 p-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        ) : servers.length === 0 ? (
          <div className="text-center py-12 bg-slate-900/30 rounded-xl border border-dashed border-slate-700">
            <svg className="w-12 h-12 mx-auto text-slate-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
            </svg>
            <h3 className="text-base font-medium text-slate-300">No servers configured</h3>
            <p className="text-slate-500 text-sm mt-1">Add your first server to get started</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {servers.map((server) => (
              <div
                key={server.id}
                className={`bg-slate-900/50 rounded-xl p-4 border border-slate-700/50 hover:border-slate-600 transition-colors group/card ${!server.enabled ? 'opacity-60' : ''}`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${
                      server.protocol === 'ssh' ? 'bg-emerald-900/40 text-emerald-400' :
                      server.protocol === 'rdp' ? 'bg-blue-900/40 text-blue-400' :
                      'bg-purple-900/40 text-purple-400'
                    }`}>
                      {getProtocolIcon(server.protocol)}
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-100">{server.name}</h3>
                      <p className="text-xs text-slate-500 font-mono">{server.host}:{server.port}</p>
                    </div>
                  </div>
                  <span className={`px-2 py-1 text-xs font-medium rounded uppercase ${getProtocolColor(server.protocol)}`}>
                    {server.protocol}
                  </span>
                </div>

                {server.department && server.department.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1">
                    {server.department.map((dept) => (
                      <span key={dept} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-violet-900/40 text-violet-400 border border-violet-700/50 rounded">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                        {dept}
                      </span>
                    ))}
                  </div>
                )}

                {server.description && (
                  <p className="text-sm text-slate-400 mb-3 line-clamp-2">{server.description}</p>
                )}

                <div className="flex items-center justify-between pt-3 border-t border-slate-700/50">
                  <div className="flex items-center gap-3">
                    {/* Toggle Switch */}
                    <button
                      onClick={() => handleToggleEnabled(server)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-slate-800 ${
                        server.enabled ? 'bg-green-600' : 'bg-slate-600'
                      }`}
                      role="switch"
                      aria-checked={server.enabled}
                      title={server.enabled ? 'Click to disable' : 'Click to enable'}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition-transform ${
                          server.enabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                    <span className={`text-xs font-medium ${server.enabled ? 'text-green-400' : 'text-slate-500'}`}>
                      {server.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                    {server.active_sessions !== undefined && server.active_sessions > 0 && (
                      <span className="px-2 py-0.5 text-xs font-medium bg-primary-900/40 text-primary-400 rounded">
                        {server.active_sessions} active
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover/card:opacity-100 transition-opacity">
                    <button
                      onClick={() => openAccessModal(server)}
                      className="p-2 text-slate-400 hover:text-primary-400 hover:bg-slate-700 rounded-lg transition-colors"
                      title="Manage access"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleEdit(server)}
                      className="p-2 text-slate-400 hover:text-primary-400 hover:bg-slate-700 rounded-lg transition-colors"
                      title="Edit server"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDelete(server)}
                      className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded-lg transition-colors"
                      title="Delete server"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-slate-800 rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto border border-slate-700">
            <h2 className="text-xl font-semibold text-slate-100 mb-4">
              {editingServer ? 'Edit Server' : 'Add Server'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  placeholder="Production Server"
                  className="w-full px-4 py-2 border border-slate-600 bg-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 placeholder-slate-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Host</label>
                  <input
                    type="text"
                    value={formData.host}
                    onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                    required
                    placeholder="192.168.1.100"
                    className="w-full px-4 py-2 border border-slate-600 bg-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 placeholder-slate-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Port</label>
                  <input
                    type="number"
                    value={formData.port}
                    onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) })}
                    required
                    className="w-full px-4 py-2 border border-slate-600 bg-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Protocol</label>
                <select
                  value={formData.protocol}
                  onChange={(e) => {
                    const protocol = e.target.value as 'ssh' | 'rdp' | 'vnc';
                    const defaultPort = protocol === 'ssh' ? 22 : protocol === 'rdp' ? 3389 : 5900;
                    setFormData({ ...formData, protocol, port: defaultPort });
                  }}
                  className="w-full px-4 py-2 border border-slate-600 bg-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="ssh">SSH</option>
                  <option value="rdp">RDP</option>
                  <option value="vnc">VNC</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Username (optional)</label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    placeholder="e.g. Administrator"
                    autoComplete="off"
                    className="w-full px-4 py-2 border border-slate-600 bg-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 placeholder-slate-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">{editingServer ? 'Password (leave blank to keep)' : 'Password (optional)'}</label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    className="w-full px-4 py-2 border border-slate-600 bg-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 placeholder-slate-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Department (optional)</label>
                <div className="space-y-2 max-h-40 overflow-y-auto px-4 py-3 border border-slate-600 bg-slate-700 rounded-lg">
                  {departments.length === 0 ? (
                    <p className="text-sm text-slate-500">No departments available. Create departments first.</p>
                  ) : (
                    departments.map((dept) => (
                      <label key={dept} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.department.includes(dept)}
                          onChange={(e) => {
                            const updated = e.target.checked
                              ? [...formData.department, dept]
                              : formData.department.filter((d) => d !== dept);
                            setFormData({ ...formData, department: updated });
                          }}
                          className="rounded border-slate-500 bg-slate-600 text-primary-600 focus:ring-primary-500 focus:ring-offset-0"
                        />
                        <span className="text-sm text-slate-200">{dept}</span>
                      </label>
                    ))
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1">Users with the same department will automatically have access</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={2}
                  placeholder="Optional description..."
                  className="w-full px-4 py-2 border border-slate-600 bg-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 placeholder-slate-500"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 border border-slate-600 text-slate-300 rounded-lg hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                >
                  {editingServer ? 'Save Changes' : 'Create Server'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Access Management Modal */}
      {showAccessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-slate-800 rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto border border-slate-700">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-100">Access Control</h2>
                <p className="text-sm text-slate-400">{showAccessModal.name}</p>
              </div>
              <button
                onClick={() => {
                  setShowAccessModal(null);
                  setShowAddUserDropdown(false);
                  setShowAddGroupDropdown(false);
                }}
                className="text-slate-500 hover:text-slate-300"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {accessError && (
              <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded-lg">
                <p className="text-sm text-red-400">{accessError}</p>
              </div>
            )}

            {/* Add Department Access */}
            <div className="mb-6">
              <h3 className="text-sm font-medium text-slate-300 mb-2">Add Department</h3>
              <div className="space-y-2 max-h-40 overflow-y-auto px-4 py-3 border border-slate-600 bg-slate-700/50 rounded-lg">
                {departments.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center">No departments available. Create departments first.</p>
                ) : (
                  departments.map((dept) => {
                    const isChecked = deptRef.current.includes(dept);
                    return (
                      <label key={dept} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={async (e) => {
                            const current = [...deptRef.current];
                            const updated = e.target.checked
                              ? [...current, dept]
                              : current.filter((d: string) => d !== dept);
                            deptRef.current = updated;
                            await updateServer(showAccessModal.id, { department: updated });
                            setShowAccessModal({ ...showAccessModal, department: updated });
                            // Reload access list since backend syncs group access
                            loadServerAccess(showAccessModal.id);
                          }}
                          className="rounded border-slate-500 bg-slate-600 text-primary-600 focus:ring-primary-500 focus:ring-offset-0"
                        />
                        <span className="text-sm text-slate-200">{dept}</span>
                      </label>
                    );
                  })
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1">Users with matching department will automatically have access</p>
            </div>

            {/* Current Access List */}
            <div>
              <h3 className="text-sm font-medium text-slate-300 mb-2">Current Access</h3>
              {loadingAccess ? (
                <div className="py-8 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
                </div>
              ) : serverAccess.length === 0 ? (
                <div className="py-8 text-center text-slate-500 bg-slate-700/50 rounded-lg">
                  <svg className="w-12 h-12 text-slate-600 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <p>No access granted yet</p>
                  <p className="text-xs mt-1">Select departments above to grant access</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {serverAccess.map((access) => (
                    <div
                      key={access.id}
                      className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        {access.user ? (
                          <>
                            <div
                              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium"
                              style={{ backgroundColor: access.user.avatar_color }}
                            >
                              {access.user.display_name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium text-slate-100">{access.user.display_name}</p>
                              <p className="text-xs text-slate-500">User · @{access.user.username}</p>
                            </div>
                          </>
                        ) : access.group ? (
                          <>
                            <div
                              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium"
                              style={{ backgroundColor: access.group.color }}
                            >
                              {access.group.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium text-slate-100">{access.group.name}</p>
                              <p className="text-xs text-slate-500">Group · {access.group.member_count} members</p>
                            </div>
                          </>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
