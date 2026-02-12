import { ReactNode } from 'react';
import { useAuthStore } from '../stores/authStore';
import PersistentSession from './PersistentSession';
import smartAuditLogo from '../assets/smartaudit_transparent_logo.png';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { user, signOut } = useAuthStore();

  const getInitials = () => {
    if (user?.display_name) {
      return user.display_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return user?.username?.[0]?.toUpperCase() || 'U';
  };

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        {/* Logo Header */}
        <div className="p-5 border-b border-gray-200">
          <img
            src={smartAuditLogo}
            alt="SmartAudit"
            className="h-12 mb-2"
          />
          <p className="text-xs text-gray-500">Remote Access Client</p>
        </div>

        {/* Navigation placeholder for future */}
        <nav className="p-3">
          <a
            href="#"
            className="flex items-center gap-3 px-3 py-2 rounded-lg bg-brand-pale text-brand-navy font-medium"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
            </svg>
            Servers
          </a>
        </nav>

        {/* Session Monitoring Indicator - Compact */}
        <div className="flex-1 p-4">
          <div className="bg-brand-pale/50 border border-brand-light rounded-lg p-3">
            <div className="flex items-center gap-2 text-brand-navy">
              <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span className="text-sm font-medium">Session Monitored</span>
            </div>
            <p className="text-xs text-gray-500 mt-1.5 ml-6">
              All sessions are recorded for security.
            </p>
          </div>
        </div>

        {/* User Profile */}
        <div className="p-4 border-t border-gray-200">
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold"
              style={{ backgroundColor: user?.avatar_color || '#0a3d62' }}
            >
              {getInitials()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {user?.display_name || user?.username}
              </p>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-brand-pale text-brand-navy">
                Client
              </span>
            </div>
          </div>
          <button
            onClick={() => signOut()}
            className="w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">{children}</main>

      {/* Persistent session overlay */}
      <PersistentSession />
    </div>
  );
}
