import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useUserStore, User } from '../stores/userStore';
import { useAuthStore } from '../stores/authStore';
import { format } from 'date-fns';
import { api } from '../services/api';
import type { UserBan, BanDuration } from '@smartaiaudit/shared';

const roleLabels: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  auditor: 'Auditor',
  client: 'Client',
};

const roleBadgeColors: Record<string, string> = {
  super_admin: 'bg-purple-900/50 text-purple-400 border border-purple-700',
  admin: 'bg-blue-900/50 text-blue-400 border border-blue-700',
  auditor: 'bg-green-900/50 text-green-400 border border-green-700',
  client: 'bg-slate-700 text-slate-400 border border-slate-600',
};

interface BanModalState {
  isOpen: boolean;
  user: User | null;
  bans: UserBan[];
  loading: boolean;
}

export default function UsersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { users, loading, error, fetchUsers, createUser, updateUser, deleteUser, resetPassword } = useUserStore();
  const { user: currentUser } = useAuthStore();
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [roleFilter, setRoleFilter] = useState('');
  const [departments, setDepartments] = useState<string[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState<User | null>(null);
  const [showResetPasswordModal, setShowResetPasswordModal] = useState<User | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Create form state
  const [createForm, setCreateForm] = useState({
    username: '',
    password: '',
    confirmPassword: '',
    displayName: '',
    role: 'client' as 'admin' | 'auditor' | 'client',
    department: '',
  });

  // Edit form state
  const [editForm, setEditForm] = useState({
    username: '',
    displayName: '',
    role: '' as string,
    password: '',
  });

  // Reset password form
  const [newPassword, setNewPassword] = useState('');

  // Ban modal state
  const [banModal, setBanModal] = useState<BanModalState>({
    isOpen: false,
    user: null,
    bans: [],
    loading: false,
  });
  const [userBanStatus, setUserBanStatus] = useState<Map<string, boolean>>(new Map());
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  // Ban creation dialog state
  const [showBanDialog, setShowBanDialog] = useState<User | null>(null);
  const [banDuration, setBanDuration] = useState<BanDuration>('permanent');
  const [banReason, setBanReason] = useState('');
  const [banSubmitting, setBanSubmitting] = useState(false);

  // Load departments from groups (Departments page)
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
    fetchUsers({ search: initialSearch || undefined, role: roleFilter || undefined });
    setTimeout(() => setInitialLoadDone(true), 350);
  }, []);

  // Check ban status for all users (parallel for performance)
  useEffect(() => {
    const checkBanStatus = async () => {
      const results = await Promise.allSettled(
        users.map(user =>
          api.get<{ banned: boolean }>(`/api/bans/check/${user.id}`)
            .then(res => ({ id: user.id, banned: res.success ? (res.data?.banned || false) : false }))
            .catch(() => ({ id: user.id, banned: false }))
        )
      );
      const statusMap = new Map<string, boolean>();
      for (const result of results) {
        if (result.status === 'fulfilled') {
          statusMap.set(result.value.id, result.value.banned);
        }
      }
      setUserBanStatus(statusMap);
    };

    if (users.length > 0) {
      checkBanStatus();
    }
  }, [users]);

  // Debounced search - skip on initial load to prevent overwriting URL param results
  useEffect(() => {
    if (!initialLoadDone) return;

    const timer = setTimeout(() => {
      fetchUsers({ search: search || undefined, role: roleFilter || undefined });
    }, 300);
    return () => clearTimeout(timer);
  }, [search, roleFilter, fetchUsers, initialLoadDone]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (createForm.username.length < 3) {
      setFormError('Username must be at least 3 characters');
      return;
    }

    if (createForm.password.length < 6) {
      setFormError('Password must be at least 6 characters');
      return;
    }

    if (createForm.password !== createForm.confirmPassword) {
      setFormError('Passwords do not match');
      return;
    }

    const success = await createUser({
      username: createForm.username,
      password: createForm.password,
      displayName: createForm.displayName,
      role: createForm.role,
      department: createForm.department || undefined,
    });

    if (success) {
      setShowCreateModal(false);
      setCreateForm({ username: '', password: '', confirmPassword: '', displayName: '', role: 'client', department: '' });
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showEditModal) return;

    const updates: any = {
      username: editForm.username,
      displayName: editForm.displayName,
      role: editForm.role,
    };
    if (editForm.password) {
      updates.password = editForm.password;
    }

    const success = await updateUser(showEditModal.id, updates);

    if (success) {
      setShowEditModal(null);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showResetPasswordModal) return;

    if (newPassword.length < 6) {
      setFormError('Password must be at least 6 characters');
      return;
    }

    const success = await resetPassword(showResetPasswordModal.id, newPassword);

    if (success) {
      setShowResetPasswordModal(null);
      setNewPassword('');
    }
  };

  const handleDelete = async (user: User) => {
    if (confirm(`Are you sure you want to delete user "${user.display_name}"? This action cannot be undone.`)) {
      await deleteUser(user.id);
    }
  };

  const openEditModal = (user: User) => {
    setEditForm({
      username: user.username,
      displayName: user.display_name,
      role: user.role,
      password: '',
    });
    setShowEditModal(user);
  };

  // Determine available roles based on current user's role
  const availableRoles = currentUser?.role === 'super_admin'
    ? ['admin', 'auditor', 'client']
    : ['auditor', 'client'];

  const availableEditRoles = currentUser?.role === 'super_admin'
    ? ['admin', 'auditor', 'client']
    : currentUser?.role === 'admin'
    ? ['admin', 'auditor', 'client']
    : ['auditor', 'client'];

  const openBanModal = async (user: User) => {
    setBanModal({ isOpen: true, user, bans: [], loading: true });
    try {
      const response = await api.get<UserBan[]>(`/api/bans/user/${user.id}`);
      if (response.success && response.data) {
        setBanModal((prev) => ({ ...prev, bans: response.data || [], loading: false }));
      } else {
        setBanModal((prev) => ({ ...prev, loading: false }));
      }
    } catch {
      setBanModal((prev) => ({ ...prev, loading: false }));
    }
  };

  const closeBanModal = () => {
    setBanModal({ isOpen: false, user: null, bans: [], loading: false });
  };

  const handleUnban = async (banId: string) => {
    try {
      const response = await api.post(`/api/bans/${banId}/lift`, {});
      if (response.success) {
        // Refresh ban list
        if (banModal.user) {
          const bansResponse = await api.get<UserBan[]>(`/api/bans/user/${banModal.user.id}`);
          if (bansResponse.success && bansResponse.data) {
            setBanModal((prev) => ({ ...prev, bans: bansResponse.data || [] }));
          }
        }
        // Update ban status
        setUserBanStatus((prev) => {
          const newMap = new Map(prev);
          if (banModal.user) {
            // Check if there are still active bans
            const activeBans = banModal.bans.filter(
              (b) => b.id !== banId && !b.lifted_at && (!b.expires_at || new Date(b.expires_at) > new Date())
            );
            newMap.set(banModal.user.id, activeBans.length > 0);
          }
          return newMap;
        });
      }
    } catch (error: any) {
      alert(`Failed to lift ban: ${error.message}`);
    }
  };

  const handleBan = async () => {
    if (!showBanDialog || !banReason.trim()) return;
    setBanSubmitting(true);
    try {
      const response = await api.post('/api/bans', {
        userId: showBanDialog.id,
        reason: banReason.trim(),
        duration: banDuration,
      });
      if (response.success) {
        setShowBanDialog(null);
        setBanReason('');
        setBanDuration('permanent');
        // Update ban status
        setUserBanStatus((prev) => {
          const newMap = new Map(prev);
          newMap.set(showBanDialog.id, true);
          return newMap;
        });
      } else {
        alert(`Failed to ban user: ${(response as any).error || 'Unknown error'}`);
      }
    } catch (error: any) {
      alert(`Failed to ban user: ${error.message}`);
    } finally {
      setBanSubmitting(false);
    }
  };

  const handleQuickUnban = async (userId: string) => {
    try {
      // Fetch active bans for user
      const response = await api.get<UserBan[]>(`/api/bans/user/${userId}`);
      if (response.success && response.data) {
        const activeBans = response.data.filter(
          (b) => !b.lifted_at && (!b.expires_at || new Date(b.expires_at) > new Date())
        );
        // Lift all active bans
        for (const ban of activeBans) {
          await api.post(`/api/bans/${ban.id}/lift`, {});
        }
        // Update ban status
        setUserBanStatus((prev) => {
          const newMap = new Map(prev);
          newMap.set(userId, false);
          return newMap;
        });
      }
    } catch (error: any) {
      alert(`Failed to unban user: ${error.message}`);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <p className="text-slate-400">Manage users who can access the system</p>
          {!loading && (
            <span className="px-2 py-0.5 text-xs font-medium bg-slate-700 text-slate-300 rounded-full">
              {users.length} users
            </span>
          )}
        </div>
        {currentUser?.role !== 'auditor' && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors flex items-center gap-2 shadow-lg shadow-primary-900/30"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add User
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="bg-slate-800 rounded-xl shadow-lg shadow-black/20 p-4 flex gap-4">
        <div className="flex-1 relative">
          <input
            type="text"
            placeholder="Search by username or display name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-600 bg-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent placeholder-slate-500"
          />
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="px-4 py-2 border border-slate-600 bg-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="">All Roles</option>
          {currentUser?.role === 'super_admin' && <option value="super_admin">Super Admin</option>}
          {currentUser?.role !== 'auditor' && <option value="admin">Admin</option>}
          <option value="auditor">Auditor</option>
          <option value="client">Client</option>
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-4">
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {/* Users Table */}
      <div className="bg-slate-800 rounded-xl shadow-lg shadow-black/20 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-900 border-b border-slate-700">
            <tr>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">User</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Department</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Role</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Last Login</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Created</th>
              <th className="text-right px-6 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                  No users found
                </td>
              </tr>
            ) : (
              users.filter((u) => {
                if (currentUser?.role === 'auditor') return u.role === 'auditor' || u.role === 'client';
                if (currentUser?.role !== 'super_admin') return u.role !== 'super_admin';
                return true;
              }).map((user) => (
                <tr key={user.id} className="hover:bg-slate-700/50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0"
                        style={{ backgroundColor: user.avatar_color }}
                      >
                        {user.display_name?.[0]?.toUpperCase() || user.username[0].toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-slate-100">{user.display_name}</p>
                          {userBanStatus.get(user.id) && (
                            <span className="px-1.5 py-0.5 text-[9px] font-bold bg-red-500/20 text-red-400 border border-red-500/30 rounded uppercase">Banned</span>
                          )}
                        </div>
                        <p className="text-sm text-slate-500">@{user.username}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-400 text-sm">
                    {user.department || <span className="text-slate-600">—</span>}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-xs font-medium rounded ${roleBadgeColors[user.role]}`}>
                      {roleLabels[user.role]}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-400 text-sm">
                    {user.last_login_at
                      ? format(new Date(user.last_login_at), 'MMM d, yyyy h:mm a')
                      : 'Never'}
                  </td>
                  <td className="px-6 py-4 text-slate-400 text-sm">
                    {format(new Date(user.created_at), 'MMM d, yyyy')}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {(() => {
                      const isAuditor = currentUser?.role === 'auditor';
                      const canEdit = !isAuditor &&
                        (currentUser?.role === 'super_admin' || user.role !== 'super_admin');
                      const canBan = user.id !== currentUser?.id && user.role !== 'super_admin' &&
                        (!isAuditor || user.role === 'client');
                      const canResetPw = !isAuditor &&
                        (currentUser?.role === 'super_admin' || user.role !== 'super_admin');
                      const canDelete = !isAuditor &&
                        user.role !== 'super_admin' && user.id !== currentUser?.id &&
                        (currentUser?.role === 'super_admin' || currentUser?.role === 'admin');
                      const isBanned = userBanStatus.get(user.id);

                      return (
                        <div className="flex justify-end items-center gap-1 min-w-[144px]">
                          {canEdit && (
                            <button
                              onClick={() => openEditModal(user)}
                              className="p-2 text-slate-400 hover:text-primary-400 hover:bg-slate-700 rounded-lg transition-colors"
                              title="Edit user"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                          )}
                          {canBan && (
                            isBanned ? (
                              <button
                                onClick={() => handleQuickUnban(user.id)}
                                className="p-2 text-green-400 hover:text-green-300 hover:bg-slate-700 rounded-lg transition-colors"
                                title="Unban user"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              </button>
                            ) : (
                              <button
                                onClick={() => setShowBanDialog(user)}
                                className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded-lg transition-colors"
                                title="Ban user"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                </svg>
                              </button>
                            )
                          )}
                          <button
                            onClick={() => openBanModal(user)}
                            className="p-2 text-slate-400 hover:text-orange-400 hover:bg-slate-700 rounded-lg transition-colors"
                            title="View ban history"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </button>
                          {canResetPw && (
                            <button
                              onClick={() => setShowResetPasswordModal(user)}
                              className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded-lg transition-colors"
                              title="Reset password"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                              </svg>
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => handleDelete(user)}
                              className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded-lg transition-colors"
                              title="Delete user"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-slate-800 rounded-xl shadow-xl w-full max-w-md p-6 border border-slate-700">
            <h2 className="text-xl font-semibold text-slate-100 mb-4">Create User</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Username</label>
                <input
                  type="text"
                  value={createForm.username}
                  onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
                  required
                  className="w-full px-4 py-2 border border-slate-600 bg-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 placeholder-slate-500"
                  placeholder="username"
                />
                <p className="text-xs text-slate-500 mt-1">Minimum 3 characters</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Display Name</label>
                <input
                  type="text"
                  value={createForm.displayName}
                  onChange={(e) => setCreateForm({ ...createForm, displayName: e.target.value })}
                  required
                  className="w-full px-4 py-2 border border-slate-600 bg-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 placeholder-slate-500"
                  placeholder="John Smith"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Password</label>
                <input
                  type="password"
                  value={createForm.password}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                  required
                  className="w-full px-4 py-2 border border-slate-600 bg-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 placeholder-slate-500"
                  placeholder="Minimum 6 characters"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Confirm Password</label>
                <input
                  type="password"
                  value={createForm.confirmPassword}
                  onChange={(e) => setCreateForm({ ...createForm, confirmPassword: e.target.value })}
                  required
                  className="w-full px-4 py-2 border border-slate-600 bg-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Role</label>
                <select
                  value={createForm.role}
                  onChange={(e) => {
                    const newRole = e.target.value as 'admin' | 'auditor' | 'client';
                    setCreateForm({ ...createForm, role: newRole, department: (newRole === 'admin' || newRole === 'auditor') ? '' : createForm.department });
                  }}
                  className="w-full px-4 py-2 border border-slate-600 bg-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  {availableRoles.map((role) => (
                    <option key={role} value={role}>{roleLabels[role]}</option>
                  ))}
                </select>
              </div>
              {createForm.role !== 'admin' && createForm.role !== 'auditor' && (
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Department</label>
                  <select
                    value={createForm.department}
                    onChange={(e) => setCreateForm({ ...createForm, department: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-600 bg-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">Select Department</option>
                    {departments.map((dept) => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </select>
                </div>
              )}

              {(formError || error) && (
                <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg">
                  <p className="text-sm text-red-400">{formError || error}</p>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setFormError(null);
                  }}
                  className="flex-1 px-4 py-2 border border-slate-600 text-slate-300 rounded-lg hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                >
                  Create User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-slate-800 rounded-xl shadow-xl w-full max-w-md p-6 border border-slate-700">
            <h2 className="text-xl font-semibold text-slate-100 mb-4">Edit User</h2>
            <form onSubmit={handleEdit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Username</label>
                <input
                  type="text"
                  value={editForm.username}
                  onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                  required
                  className="w-full px-4 py-2 border border-slate-600 bg-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Display Name</label>
                <input
                  type="text"
                  value={editForm.displayName}
                  onChange={(e) => setEditForm({ ...editForm, displayName: e.target.value })}
                  required
                  className="w-full px-4 py-2 border border-slate-600 bg-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Role</label>
                <select
                  value={editForm.role}
                  onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                  disabled={showEditModal.id === currentUser?.id && currentUser?.role === 'super_admin'}
                  className={`w-full px-4 py-2 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 ${showEditModal.id === currentUser?.id && currentUser?.role === 'super_admin' ? 'bg-slate-900 text-slate-500 cursor-not-allowed' : 'bg-slate-700 text-slate-100'}`}
                >
                  {availableEditRoles.map((role) => (
                    <option key={role} value={role}>{roleLabels[role]}</option>
                  ))}
                </select>
              </div>

              {error && (
                <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg">
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowEditModal(null)}
                  className="flex-1 px-4 py-2 border border-slate-600 text-slate-300 rounded-lg hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {showResetPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-slate-800 rounded-xl shadow-xl w-full max-w-md p-6 border border-slate-700">
            <h2 className="text-xl font-semibold text-slate-100 mb-4">Reset Password</h2>
            <p className="text-slate-400 mb-4">
              Set a new password for <strong className="text-slate-200">{showResetPasswordModal.display_name}</strong>
            </p>
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-slate-600 bg-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 placeholder-slate-500"
                  placeholder="Minimum 6 characters"
                />
              </div>

              {(formError || error) && (
                <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg">
                  <p className="text-sm text-red-400">{formError || error}</p>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowResetPasswordModal(null);
                    setNewPassword('');
                    setFormError(null);
                  }}
                  className="flex-1 px-4 py-2 border border-slate-600 text-slate-300 rounded-lg hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                >
                  Reset Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Ban History Modal */}
      {banModal.isOpen && banModal.user && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-slate-800 rounded-xl shadow-xl w-full max-w-2xl p-6 max-h-[80vh] overflow-hidden flex flex-col border border-slate-700">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-100">Ban History</h2>
                <p className="text-slate-400">
                  {banModal.user.display_name} (@{banModal.user.username})
                </p>
              </div>
              <button
                onClick={closeBanModal}
                className="text-slate-500 hover:text-slate-300"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {banModal.loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
                </div>
              ) : banModal.bans.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <svg className="w-12 h-12 mx-auto mb-3 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p>No ban history for this user</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {banModal.bans.map((ban) => {
                    const isActive = !ban.lifted_at && (!ban.expires_at || new Date(ban.expires_at) > new Date());
                    return (
                      <div
                        key={ban.id}
                        className={`border rounded-lg p-4 ${
                          isActive ? 'border-red-700 bg-red-900/30' : 'border-slate-700 bg-slate-700/50'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <span className={`px-2 py-1 text-xs font-medium rounded ${
                                isActive ? 'bg-red-800 text-red-200' : 'bg-slate-600 text-slate-300'
                              }`}>
                                {isActive ? 'Active' : 'Expired/Lifted'}
                              </span>
                              <span className={`px-2 py-1 text-xs font-medium rounded ${
                                ban.server_id ? 'bg-orange-900/50 text-orange-400 border border-orange-700' : 'bg-purple-900/50 text-purple-400 border border-purple-700'
                              }`}>
                                {ban.server_id ? `Server: ${ban.server_name || 'Unknown'}` : 'Global'}
                              </span>
                            </div>
                            <p className="text-slate-100 font-medium mb-1">{ban.reason}</p>
                            <div className="text-sm text-slate-400 space-y-1">
                              <p>Banned by: {ban.banned_by_username || 'Unknown'}</p>
                              <p>Banned at: {format(new Date(ban.banned_at), 'MMM d, yyyy HH:mm')}</p>
                              {ban.expires_at && (
                                <p>Expires: {format(new Date(ban.expires_at), 'MMM d, yyyy HH:mm')}</p>
                              )}
                              {!ban.expires_at && <p>Duration: Permanent</p>}
                              {ban.lifted_at && (
                                <p className="text-green-400">
                                  Lifted at: {format(new Date(ban.lifted_at), 'MMM d, yyyy HH:mm')}
                                </p>
                              )}
                            </div>
                          </div>
                          {isActive && (
                            <button
                              onClick={() => handleUnban(ban.id)}
                              className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors"
                            >
                              Lift Ban
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex justify-end mt-4 pt-4 border-t border-slate-700">
              <button
                onClick={closeBanModal}
                className="px-4 py-2 border border-slate-600 text-slate-300 rounded-lg hover:bg-slate-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ban User Dialog */}
      {showBanDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-slate-800 rounded-xl shadow-xl w-full max-w-md p-6 border border-slate-700">
            <h2 className="text-xl font-semibold text-slate-100 mb-4">Ban User</h2>
            <p className="text-slate-400 mb-4">
              Ban <strong className="text-slate-200">{showBanDialog.display_name}</strong> (@{showBanDialog.username})
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Duration</label>
                <select
                  value={banDuration}
                  onChange={(e) => setBanDuration(e.target.value as BanDuration)}
                  className="w-full px-4 py-2 border border-slate-600 bg-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="1h">1 Hour</option>
                  <option value="24h">24 Hours</option>
                  <option value="7d">7 Days</option>
                  <option value="30d">30 Days</option>
                  <option value="permanent">Permanent</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Reason</label>
                <textarea
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  required
                  rows={3}
                  className="w-full px-4 py-2 border border-slate-600 bg-slate-700 text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 placeholder-slate-500 resize-none"
                  placeholder="Reason for banning this user (required)"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowBanDialog(null);
                    setBanReason('');
                    setBanDuration('permanent');
                  }}
                  className="flex-1 px-4 py-2 border border-slate-600 text-slate-300 rounded-lg hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleBan}
                  disabled={banSubmitting || !banReason.trim()}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {banSubmitting ? 'Banning...' : 'Confirm Ban'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
