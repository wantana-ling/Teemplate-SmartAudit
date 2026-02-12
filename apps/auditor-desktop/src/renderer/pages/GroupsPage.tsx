import { useEffect, useState } from 'react';
import { api } from '../services/api';

interface Group {
  id: string;
  name: string;
  description: string | null;
  color: string;
  member_count: number;
  server_count: number;
  created_at: string;
}

interface User {
  id: string;
  username: string;
  display_name: string;
  role: string;
  avatar_color: string;
}

interface GroupMember {
  id: string;
  user: User;
  assigned_at: string;
}

interface Server {
  id: string;
  name: string;
  host: string;
  port: number;
  protocol: string;
  enabled: boolean;
  description?: string;
}

interface GroupServer {
  id: string;
  server_id: string;
  group_id: string;
  granted_at: string;
  server: Server;
}

export default function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showMembersModal, setShowMembersModal] = useState<Group | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [showAddMemberDropdown, setShowAddMemberDropdown] = useState(false);
  const [addingMember, setAddingMember] = useState(false);
  const [search, setSearch] = useState('');

  // Server management state
  const [modalTab, setModalTab] = useState<'members' | 'servers'>('members');
  const [groupServers, setGroupServers] = useState<GroupServer[]>([]);
  const [loadingServers, setLoadingServers] = useState(false);
  const [serversLoaded, setServersLoaded] = useState(false); // Track if servers have been fetched
  const [allServers, setAllServers] = useState<Server[]>([]);
  const [showAddServerDropdown, setShowAddServerDropdown] = useState(false);
  const [addingServer, setAddingServer] = useState(false);

  // Filter groups based on search
  const filteredGroups = groups.filter(group =>
    group.name.toLowerCase().includes(search.toLowerCase()) ||
    (group.description && group.description.toLowerCase().includes(search.toLowerCase()))
  );

  // Create form state
  const [newGroup, setNewGroup] = useState({
    name: '',
    description: '',
    color: '#6B7280',
  });

  const loadGroups = async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/groups');
      if (response.success) {
        setGroups(response.data);
      } else {
        setError(response.error || 'Failed to load groups');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGroups();
  }, []);

  const loadMembers = async (groupId: string) => {
    try {
      setLoadingMembers(true);
      const response = await api.get(`/api/groups/${groupId}/members`);
      if (response.success) {
        setMembers(response.data);
      }
    } catch (err: any) {
      console.error('Failed to load members:', err);
    } finally {
      setLoadingMembers(false);
    }
  };

  const loadAllUsers = async () => {
    try {
      const response = await api.get('/api/users');
      if (response.success) {
        setAllUsers(response.data);
      }
    } catch (err: any) {
      console.error('Failed to load users:', err);
    }
  };

  const loadGroupServers = async (groupId: string) => {
    try {
      setLoadingServers(true);
      const response = await api.get(`/api/groups/${groupId}/servers`);
      if (response.success) {
        setGroupServers(response.data as GroupServer[]);
        setServersLoaded(true);
      }
    } catch (err: any) {
      console.error('Failed to load group servers:', err);
    } finally {
      setLoadingServers(false);
    }
  };

  const loadAllServers = async () => {
    try {
      const response = await api.getServers();
      if (response.success) {
        setAllServers(response.data as Server[]);
      }
    } catch (err: any) {
      console.error('Failed to load servers:', err);
    }
  };

  const handleAddServer = async (groupId: string, serverId: string) => {
    try {
      setAddingServer(true);
      const response = await api.post(`/api/groups/${groupId}/servers`, { serverId });
      if (response.success) {
        loadGroupServers(groupId);
        setShowAddServerDropdown(false);
      } else {
        setError(response.error || 'Failed to add server');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAddingServer(false);
    }
  };

  const handleRemoveServer = async (groupId: string, serverId: string) => {
    try {
      const response = await api.delete(`/api/groups/${groupId}/servers/${serverId}`);
      if (response.success) {
        loadGroupServers(groupId);
      } else {
        setError(response.error || 'Failed to remove server');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleAddMember = async (groupId: string, userId: string) => {
    try {
      setAddingMember(true);
      const response = await api.post(`/api/groups/${groupId}/members`, { userId });
      if (response.success) {
        loadMembers(groupId);
        loadGroups(); // Refresh to update member count
        setShowAddMemberDropdown(false);
      } else {
        setError(response.error || 'Failed to add member');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAddingMember(false);
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await api.post('/api/groups', newGroup);
      if (response.success) {
        setShowCreateModal(false);
        setNewGroup({ name: '', description: '', color: '#6B7280' });
        loadGroups();
      } else {
        setError(response.error || 'Failed to create group');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!confirm('Are you sure you want to delete this group?')) return;

    try {
      const response = await api.delete(`/api/groups/${groupId}`);
      if (response.success) {
        loadGroups();
      } else {
        setError(response.error || 'Failed to delete group');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleRemoveMember = async (groupId: string, userId: string) => {
    try {
      const response = await api.delete(`/api/groups/${groupId}/members/${userId}`);
      if (response.success) {
        loadMembers(groupId);
        loadGroups(); // Refresh to update member count
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const colorOptions = [
    '#6B7280', '#EF4444', '#F97316', '#EAB308', '#22C55E',
    '#14B8A6', '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899',
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <p className="text-slate-400">Manage user groups for server access control</p>
          <span className="px-2 py-0.5 text-xs font-medium bg-slate-700 text-slate-300 rounded-full">
            {search ? `${filteredGroups.length} of ${groups.length}` : groups.length} groups
          </span>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors flex items-center gap-2 shadow-lg shadow-primary-900/30"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create Group
        </button>
      </div>

      {/* Search */}
      <div className="bg-slate-800 rounded-xl shadow-lg shadow-black/20 p-4">
        <div className="relative">
          <input
            type="text"
            placeholder="Search groups by name or description"
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
        <div className="p-4 bg-red-900/30 border border-red-700 rounded-lg">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Groups Grid */}
      <div className="bg-slate-800 rounded-xl shadow-lg shadow-black/20 p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredGroups.map((group) => (
            <div
              key={group.id}
              className="bg-slate-900/50 rounded-xl p-4 border border-slate-700/50 hover:border-slate-600 transition-colors group/card"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-semibold text-lg shadow-lg"
                    style={{ backgroundColor: group.color }}
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-100">{group.name}</h3>
                    <p className="text-xs text-slate-500 font-mono">Access group</p>
                  </div>
                </div>
                <span
                  className="px-2 py-1 text-xs font-medium rounded border"
                  style={{
                    backgroundColor: `${group.color}20`,
                    color: group.color,
                    borderColor: `${group.color}50`
                  }}
                >
                  GROUP
                </span>
              </div>

              {/* Description */}
              {group.description && (
                <p className="text-sm text-slate-400 mb-3 line-clamp-2">{group.description}</p>
              )}

              {/* Footer with badges and actions */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-700/50">
                {/* Member & Server Badges */}
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 text-xs font-medium rounded flex items-center gap-1 ${group.member_count > 0 ? 'bg-slate-700 text-slate-300' : 'bg-slate-800 text-slate-500'}`}>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    {group.member_count}
                  </span>
                  <span className={`px-2 py-0.5 text-xs font-medium rounded flex items-center gap-1 ${group.server_count > 0 ? 'bg-slate-700 text-slate-300' : 'bg-slate-800 text-slate-500'}`}>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
                    </svg>
                    {group.server_count}
                  </span>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-1 opacity-0 group-hover/card:opacity-100 transition-opacity">
                  <button
                    onClick={() => {
                      setShowMembersModal(group);
                      loadMembers(group.id);
                    }}
                    className="p-2 text-slate-400 hover:text-primary-400 hover:bg-slate-700 rounded-lg transition-colors"
                    title="Manage members & servers"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleDeleteGroup(group.id)}
                    className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded-lg transition-colors"
                    title="Delete group"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}

          {filteredGroups.length === 0 && (
            <div className="col-span-full text-center py-12 bg-slate-900/30 rounded-xl border border-dashed border-slate-700">
              <svg className="w-12 h-12 text-slate-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {search ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                )}
              </svg>
              <h3 className="text-base font-medium text-slate-300">
                {search ? 'No groups found' : 'No groups yet'}
              </h3>
              <p className="text-slate-500 text-sm mt-1">
                {search ? `No groups match "${search}"` : 'Create your first group to organize users'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Create Group Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl shadow-2xl w-full max-w-md p-6 border border-slate-700">
            <h2 className="text-xl font-semibold text-slate-100 mb-4">Create Group</h2>
            <form onSubmit={handleCreateGroup} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Group Name
                </label>
                <input
                  type="text"
                  value={newGroup.name}
                  onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-slate-600 rounded-lg bg-slate-700 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="e.g., Development Team"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Description (optional)
                </label>
                <textarea
                  value={newGroup.description}
                  onChange={(e) => setNewGroup({ ...newGroup, description: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-600 rounded-lg bg-slate-700 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  rows={2}
                  placeholder="Brief description of the group"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Color
                </label>
                <div className="flex gap-2 flex-wrap">
                  {colorOptions.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setNewGroup({ ...newGroup, color })}
                      className={`w-8 h-8 rounded-full ${
                        newGroup.color === color ? 'ring-2 ring-offset-2 ring-offset-slate-800 ring-slate-100' : ''
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-slate-300 hover:bg-slate-700 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                >
                  Create Group
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Members & Servers Modal */}
      {showMembersModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl shadow-2xl w-full max-w-lg p-6 border border-slate-700">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-slate-100">
                {showMembersModal.name}
              </h2>
              <button
                onClick={() => {
                  setShowMembersModal(null);
                  setShowAddMemberDropdown(false);
                  setShowAddServerDropdown(false);
                  setModalTab('members');
                  setServersLoaded(false);
                  setGroupServers([]);
                }}
                className="text-slate-400 hover:text-slate-200"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mb-4 bg-slate-900/50 p-1 rounded-lg">
              <button
                onClick={() => {
                  setModalTab('members');
                  setShowAddServerDropdown(false);
                }}
                className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                  modalTab === 'members'
                    ? 'bg-slate-700 text-slate-100'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Members ({members.length})
              </button>
              <button
                onClick={() => {
                  setModalTab('servers');
                  setShowAddMemberDropdown(false);
                  if (!serversLoaded) {
                    loadGroupServers(showMembersModal.id);
                  }
                }}
                className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                  modalTab === 'servers'
                    ? 'bg-slate-700 text-slate-100'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
                </svg>
                Servers{serversLoaded ? ` (${groupServers.length})` : ''}
              </button>
            </div>

            {/* Members Tab */}
            {modalTab === 'members' && (
              <>
                {/* Add Member Section */}
                <div className="mb-4 relative">
                  <button
                    onClick={() => {
                      if (!showAddMemberDropdown) {
                        loadAllUsers();
                      }
                      setShowAddMemberDropdown(!showAddMemberDropdown);
                    }}
                    className="w-full px-4 py-2 border border-dashed border-slate-600 rounded-lg text-slate-400 hover:border-primary-500 hover:text-primary-400 flex items-center justify-center gap-2 transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                    </svg>
                    Add Member
                  </button>

                  {/* User Selection Dropdown */}
                  {showAddMemberDropdown && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-slate-700 border border-slate-600 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                      {allUsers.length === 0 ? (
                        <div className="p-4 text-center text-slate-400 text-sm">
                          Loading users...
                        </div>
                      ) : (
                        <>
                          {allUsers
                            .filter(u => !members.some(m => m.user.id === u.id))
                            .map((user) => (
                              <button
                                key={user.id}
                                onClick={() => handleAddMember(showMembersModal.id, user.id)}
                                disabled={addingMember}
                                className="w-full flex items-center gap-3 p-3 hover:bg-slate-600 text-left disabled:opacity-50"
                              >
                                <div
                                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium"
                                  style={{ backgroundColor: user.avatar_color }}
                                >
                                  {user.display_name.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <p className="font-medium text-slate-100">{user.display_name}</p>
                                  <p className="text-xs text-slate-400">@{user.username} · {user.role}</p>
                                </div>
                              </button>
                            ))}
                          {allUsers.filter(u => !members.some(m => m.user.id === u.id)).length === 0 && (
                            <div className="p-4 text-center text-slate-400 text-sm">
                              All users are already members
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>

                {loadingMembers ? (
                  <div className="py-8 text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
                  </div>
                ) : members.length === 0 ? (
                  <div className="py-8 text-center text-slate-400">
                    No members in this group yet
                  </div>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {members.map((member) => (
                      <div
                        key={member.id}
                        className="flex items-center justify-between p-2 hover:bg-slate-700 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium"
                            style={{ backgroundColor: member.user.avatar_color }}
                          >
                            {member.user.display_name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-slate-100">{member.user.display_name}</p>
                            <p className="text-xs text-slate-400">@{member.user.username}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleRemoveMember(showMembersModal.id, member.user.id)}
                          className="text-slate-400 hover:text-red-400"
                          title="Remove from group"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Servers Tab */}
            {modalTab === 'servers' && (
              <>
                {/* Add Server Section */}
                <div className="mb-4 relative">
                  <button
                    onClick={() => {
                      if (!showAddServerDropdown) {
                        loadAllServers();
                      }
                      setShowAddServerDropdown(!showAddServerDropdown);
                    }}
                    className="w-full px-4 py-2 border border-dashed border-slate-600 rounded-lg text-slate-400 hover:border-primary-500 hover:text-primary-400 flex items-center justify-center gap-2 transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add Server
                  </button>

                  {/* Server Selection Dropdown */}
                  {showAddServerDropdown && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-slate-700 border border-slate-600 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                      {allServers.length === 0 ? (
                        <div className="p-4 text-center text-slate-400 text-sm">
                          Loading servers...
                        </div>
                      ) : (
                        <>
                          {allServers
                            .filter(s => !groupServers.some(gs => gs.server_id === s.id))
                            .map((server) => (
                              <button
                                key={server.id}
                                onClick={() => handleAddServer(showMembersModal.id, server.id)}
                                disabled={addingServer}
                                className="w-full flex items-center gap-3 p-3 hover:bg-slate-600 text-left disabled:opacity-50"
                              >
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white ${
                                  server.protocol === 'ssh' ? 'bg-emerald-600' :
                                  server.protocol === 'rdp' ? 'bg-blue-600' : 'bg-purple-600'
                                }`}>
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
                                  </svg>
                                </div>
                                <div>
                                  <p className="font-medium text-slate-100">{server.name}</p>
                                  <p className="text-xs text-slate-400">{server.host}:{server.port} · {server.protocol.toUpperCase()}</p>
                                </div>
                              </button>
                            ))}
                          {allServers.filter(s => !groupServers.some(gs => gs.server_id === s.id)).length === 0 && (
                            <div className="p-4 text-center text-slate-400 text-sm">
                              All servers are already assigned
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>

                {loadingServers ? (
                  <div className="py-8 text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
                  </div>
                ) : groupServers.length === 0 ? (
                  <div className="py-8 text-center text-slate-400">
                    <svg className="w-10 h-10 mx-auto mb-2 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
                    </svg>
                    No servers assigned to this group
                  </div>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {groupServers.map((gs) => (
                      <div
                        key={gs.id}
                        className="flex items-center justify-between p-2 hover:bg-slate-700 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white ${
                            gs.server.protocol === 'ssh' ? 'bg-emerald-600' :
                            gs.server.protocol === 'rdp' ? 'bg-blue-600' : 'bg-purple-600'
                          }`}>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
                            </svg>
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-slate-100">{gs.server.name}</p>
                              {!gs.server.enabled && (
                                <span className="px-1.5 py-0.5 text-xs bg-slate-600 text-slate-400 rounded">Disabled</span>
                              )}
                            </div>
                            <p className="text-xs text-slate-400">{gs.server.host}:{gs.server.port}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleRemoveServer(showMembersModal.id, gs.server_id)}
                          className="text-slate-400 hover:text-red-400"
                          title="Remove server from group"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
