import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useServerStore } from '../stores/serverStore';
import { useAuthStore } from '../stores/authStore';
import { useActiveSession } from '../contexts/ActiveSessionContext';

export default function SessionPage() {
  const { serverId } = useParams<{ serverId: string }>();
  const navigate = useNavigate();
  const { servers } = useServerStore();
  const { user, token } = useAuthStore();
  const { activeSession, isSessionActive, startSession } = useActiveSession();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const requestMadeRef = useRef(false);

  const server = servers.find((s) => s.id === serverId);

  // If there's already an active session for this server, just show it
  // If not, get a new token and start the session
  useEffect(() => {
    if (!serverId || !user?.id || !token) {
      navigate('/servers');
      return;
    }

    // Already have an active session for this server
    if (isSessionActive && activeSession?.serverId === serverId) {
      return;
    }

    // If there's an active session for a different server, don't start a new one
    if (isSessionActive && activeSession?.serverId !== serverId) {
      setError('There is already an active session. Please end it before connecting to another server.');
      return;
    }

    // Prevent duplicate requests
    if (requestMadeRef.current) {
      return;
    }

    const getConnectionToken = async () => {
      try {
        requestMadeRef.current = true;
        setLoading(true);

        const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8080';
        const response = await fetch(`${backendUrl}/api/connections/token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ serverId }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          if (response.status === 409) {
            const userName = errorData.activeUser || 'Another user';
            throw new Error(`Server is currently in use by ${userName}`);
          }
          throw new Error(errorData.error || 'Failed to get connection token');
        }

        const data = await response.json();

        if (data.success) {
          // Start the persistent session
          startSession({
            sessionId: data.data.sessionId,
            token: data.data.token,
            serverId,
            serverName: server?.name || 'Unknown Server',
          });
        } else {
          throw new Error(data.error || 'Failed to get connection token');
        }
      } catch (err: any) {
        console.error('Failed to get connection token:', err);
        setError(err.message);
        requestMadeRef.current = false;
      } finally {
        setLoading(false);
      }
    };

    getConnectionToken();
  }, [serverId, user?.id, token, isSessionActive, activeSession?.serverId, server?.name, startSession, navigate]);

  // Show error state
  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-4">&#x26A0;</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Cannot Connect</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => navigate('/servers')}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            Back to Servers
          </button>
        </div>
      </div>
    );
  }

  // Show loading state while getting token
  if (loading || !isSessionActive) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Connecting to {server?.name || 'server'}...</p>
        </div>
      </div>
    );
  }

  // The actual session UI is rendered by PersistentSession component
  // This page just shows as a placeholder while the overlay handles display
  return null;
}
