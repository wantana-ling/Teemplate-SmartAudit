import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { usePlaybackStore } from './stores/playbackStore';
import SetupPage from './pages/SetupPage';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import UsersPage from './pages/UsersPage';
import ServersPage from './pages/ServersPage';
import SessionsPage from './pages/SessionsPage';
import SessionDetailPage from './pages/SessionDetailPage';
import LiveMonitorPage from './pages/LiveMonitorPage';
import SettingsPage from './pages/SettingsPage';
import GroupsPage from './pages/GroupsPage';
import Layout from './components/Layout';
import SessionPlayback from './components/SessionPlayback';
import { format } from 'date-fns';

function App() {
  const { user, loading, setupRequired, initialize } = useAuthStore();
  const { isOpen, session: playbackSession, recordingUrl, closePlayback } = usePlaybackStore();

  // Initialize auth on mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto"></div>
          <p className="mt-4 text-gray-400">Connecting to server...</p>
        </div>
      </div>
    );
  }

  // Show setup wizard if no admin exists
  if (setupRequired) {
    return (
      <SetupPage
        onComplete={() => {
          // Re-initialize to update setupRequired state
          initialize();
        }}
      />
    );
  }

  // Not logged in
  if (!user) {
    return <LoginPage />;
  }

  // Logged in - show main app
  // Apply role-based access to routes
  const canManageUsers = ['super_admin', 'admin'].includes(user.role);
  const isSuperAdmin = user.role === 'super_admin';

  // Playback modal rendered via portal to document.body
  // Clean design: SessionPlayback component handles its own header and controls
  const playbackModal = isOpen && playbackSession && recordingUrl ? createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/95"
      onClick={closePlayback}
    >
      <div
        className="w-full max-w-6xl mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <SessionPlayback
          recordingUrl={recordingUrl}
          sessionName={playbackSession.servers?.name}
          sessionDate={format(new Date(playbackSession.started_at), 'MMM d, yyyy HH:mm')}
          onClose={closePlayback}
          onError={(err) => {
            console.error('Playback error:', err);
            closePlayback();
          }}
        />
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <>
      <Layout>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          {canManageUsers && <Route path="/users" element={<UsersPage />} />}
          {canManageUsers && <Route path="/groups" element={<GroupsPage />} />}
          <Route path="/servers" element={<ServersPage />} />
          <Route path="/sessions" element={<SessionsPage />} />
          <Route path="/sessions/:id" element={<SessionDetailPage />} />
          <Route path="/live" element={<LiveMonitorPage />} />
          {isSuperAdmin && <Route path="/settings" element={<SettingsPage />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
      {playbackModal}
    </>
  );
}

export default App;
