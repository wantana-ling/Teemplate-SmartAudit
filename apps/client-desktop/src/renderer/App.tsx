import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { ActiveSessionProvider } from './contexts/ActiveSessionContext';
import LoginPage from './pages/LoginPage';
import ServersPage from './pages/ServersPage';
import SessionPage from './pages/SessionPage';
import Layout from './components/Layout';

function App() {
  const { user, loading, initialize } = useAuthStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <ActiveSessionProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<ServersPage />} />
          <Route path="/session/:serverId" element={<SessionPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </ActiveSessionProvider>
  );
}

export default App;
