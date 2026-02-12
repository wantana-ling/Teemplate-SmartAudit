import { NavLink } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useSessionStore } from '../stores/sessionStore';
import { useEffect } from 'react';
import smartAuditLogo from '../assets/smartaudit_transparent_logo.png';

interface NavItem {
  path: string;
  label: string;
  icon: string;
  requiredRoles?: string[];
}

const navItems: NavItem[] = [
  { path: '/', label: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { path: '/live', label: 'Live Monitor', icon: 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z' },
  { path: '/sessions', label: 'Sessions', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
  { path: '/users', label: 'Users', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z', requiredRoles: ['super_admin', 'admin', 'auditor'] },
  { path: '/groups', label: 'Groups', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z', requiredRoles: ['super_admin', 'admin'] },
  { path: '/servers', label: 'Servers', icon: 'M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01' },
  { path: '/settings', label: 'Settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z', requiredRoles: ['super_admin'] },
];

const roleLabels: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  auditor: 'Auditor',
  client: 'Client',
};

const roleBadgeColors: Record<string, string> = {
  super_admin: 'bg-purple-500/20 text-purple-300 border border-purple-500/50',
  admin: 'bg-blue-500/20 text-blue-300 border border-blue-500/50',
  auditor: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50',
  client: 'bg-slate-500/20 text-slate-300 border border-slate-500/50',
};

export default function Sidebar() {
  const { user, signOut } = useAuthStore();
  const { activeSessions, fetchActiveSessions } = useSessionStore();

  useEffect(() => {
    fetchActiveSessions();
    const interval = setInterval(fetchActiveSessions, 10000);
    return () => clearInterval(interval);
  }, [fetchActiveSessions]);

  // Filter nav items based on user role
  const visibleNavItems = navItems.filter((item) => {
    if (!item.requiredRoles) return true;
    return user && item.requiredRoles.includes(user.role);
  });

  return (
    <aside className="w-64 bg-slate-900 text-white flex flex-col">
      {/* Logo */}
      <div className="p-5 border-b border-slate-700">
        <img
          src={smartAuditLogo}
          alt="SmartAudit"
          className="h-12 brightness-0 invert mb-1"
        />
        <p className="text-xs text-gray-400">Auditor Console</p>
      </div>

      {/* Active Sessions Indicator */}
      {activeSessions.length > 0 && (
        <div className="mx-4 mt-4 p-3 bg-emerald-900/50 rounded-lg border border-emerald-700">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
            <span className="text-sm font-medium text-emerald-400">
              {activeSessions.length} Active Session{activeSessions.length > 1 ? 's' : ''}
            </span>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {visibleNavItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors ${
                isActive
                  ? 'bg-primary-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`
            }
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d={item.icon}
              />
            </svg>
            <span>{item.label}</span>
            {item.path === '/live' && activeSessions.length > 0 && (
              <span className="ml-auto bg-green-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {activeSessions.length}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User Profile */}
      <div className="p-4 border-t border-slate-700">
        <div className="flex items-center gap-3 mb-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ backgroundColor: user?.avatar_color || '#3B82F6' }}
          >
            <span className="text-white font-semibold">
              {user?.display_name?.[0]?.toUpperCase() || user?.username?.[0]?.toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">
              {user?.display_name || user?.username}
            </p>
            <span
              className={`text-xs px-2 py-0.5 rounded-full text-white ${
                roleBadgeColors[user?.role || 'client']
              }`}
            >
              {roleLabels[user?.role || 'client']}
            </span>
          </div>
        </div>
        <button
          onClick={() => signOut()}
          className="w-full px-4 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
        >
          Sign Out
        </button>
      </div>
    </aside>
  );
}
