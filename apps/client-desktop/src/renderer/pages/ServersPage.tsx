import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useServerStore, Server, GroupedServers } from '../stores/serverStore';
import { useActiveSession } from '../contexts/ActiveSessionContext';

const AUTO_REFRESH_INTERVAL = 30000; // 30 seconds

// Professional SVG Icons for protocols
const TerminalIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="4 17 10 11 4 5" />
    <line x1="12" y1="19" x2="20" y2="19" />
  </svg>
);

const WindowsIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M3 5.5L10.5 4.3V11.5H3V5.5ZM3 18.5V12.5H10.5V19.7L3 18.5ZM11.5 4.1L21 2.5V11.5H11.5V4.1ZM11.5 12.5H21V21.5L11.5 19.9V12.5Z" />
  </svg>
);

const VncIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <line x1="8" y1="21" x2="16" y2="21" />
    <line x1="12" y1="17" x2="12" y2="21" />
  </svg>
);

const ServerIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
    <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
    <line x1="6" y1="6" x2="6.01" y2="6" />
    <line x1="6" y1="18" x2="6.01" y2="18" />
  </svg>
);

export default function ServersPage() {
  const navigate = useNavigate();
  const { servers, groupedServers, loading, fetchServers } = useServerStore();
  const { isSessionActive, activeSession } = useActiveSession();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  const handleRefresh = useCallback(async (showIndicator = true) => {
    if (showIndicator) setIsRefreshing(true);
    await fetchServers();
    setInitialLoadDone(true);
    if (showIndicator) {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  }, [fetchServers]);

  // Initial fetch and auto-refresh
  useEffect(() => {
    handleRefresh(false);

    const interval = setInterval(() => {
      handleRefresh(false);
    }, AUTO_REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [handleRefresh]);

  // Only show loading spinner on initial load, not on background refreshes
  const showLoading = loading && !initialLoadDone;

  const handleConnect = (serverId: string) => {
    navigate(`/session/${serverId}`);
  };

  // Sort groups: "direct" first, then alphabetically by group name
  const sortedGroupKeys = Object.keys(groupedServers).sort((a, b) => {
    if (a === 'direct') return -1;
    if (b === 'direct') return 1;
    return (groupedServers[a].group.name || '').localeCompare(groupedServers[b].group.name || '');
  });

  const hasServers = servers.length > 0;

  return (
    <div className="p-8">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Available Servers</h1>
          <p className="text-gray-600 mt-2">Select a server to start a remote session</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">
            Auto-refresh {Math.round(AUTO_REFRESH_INTERVAL / 1000)}s
          </span>
          <button
            onClick={() => handleRefresh(true)}
            disabled={isRefreshing}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
            title="Refresh servers"
          >
            <svg
              className={`w-5 h-5 text-gray-600 ${isRefreshing ? 'animate-spin' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Active Session Banner */}
      {isSessionActive && activeSession && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
            <div>
              <p className="font-medium text-green-800">Active Session</p>
              <p className="text-sm text-green-600">{activeSession.serverName}</p>
            </div>
          </div>
          <button
            onClick={() => navigate(`/session/${activeSession.serverId}`)}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
          >
            View Session
          </button>
        </div>
      )}

      {showLoading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-navy mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading servers...</p>
        </div>
      ) : !hasServers ? (
        <div className="bg-white rounded-lg shadow-sm p-12 text-center">
          <ServerIcon className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No servers available</h2>
          <p className="text-gray-600">Contact your administrator to get access to servers.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {sortedGroupKeys.map((groupId) => {
            const groupData = groupedServers[groupId];
            if (!groupData || groupData.servers.length === 0) return null;

            return (
              <ServerGroupSection
                key={groupId}
                groupData={groupData}
                onConnect={handleConnect}
                activeSession={isSessionActive ? activeSession : null}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

interface ServerGroupSectionProps {
  groupData: GroupedServers;
  onConnect: (serverId: string) => void;
  activeSession: { serverId: string; serverName: string } | null;
}

function ServerGroupSection({ groupData, onConnect, activeSession }: ServerGroupSectionProps) {
  const { group, servers } = groupData;

  return (
    <div>
      {/* Group Header */}
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-4 h-4 rounded-full"
          style={{ backgroundColor: group.color }}
        />
        <h2 className="text-lg font-semibold text-gray-800">{group.name}</h2>
        <span className="text-sm text-gray-500">({servers.length} server{servers.length !== 1 ? 's' : ''})</span>
      </div>

      {/* Servers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {servers.map((server) => (
          <ServerCard
            key={server.id}
            server={server}
            onConnect={onConnect}
            isConnected={activeSession?.serverId === server.id}
          />
        ))}
      </div>
    </div>
  );
}

interface ServerCardProps {
  server: Server;
  onConnect: (serverId: string) => void;
  isConnected: boolean;
}

// Get the appropriate icon for protocol
function getProtocolIcon(protocol: string, className: string) {
  switch (protocol) {
    case 'ssh':
      return <TerminalIcon className={className} />;
    case 'rdp':
      return <WindowsIcon className={className} />;
    case 'vnc':
      return <VncIcon className={className} />;
    default:
      return <ServerIcon className={className} />;
  }
}

// Get protocol colors
function getProtocolColors(protocol: string) {
  switch (protocol) {
    case 'ssh':
      return {
        bg: 'bg-emerald-100',
        text: 'text-emerald-700',
        icon: 'text-emerald-600',
      };
    case 'rdp':
      return {
        bg: 'bg-blue-100',
        text: 'text-blue-700',
        icon: 'text-blue-600',
      };
    case 'vnc':
      return {
        bg: 'bg-violet-100',
        text: 'text-violet-700',
        icon: 'text-violet-600',
      };
    default:
      return {
        bg: 'bg-gray-100',
        text: 'text-gray-700',
        icon: 'text-gray-600',
      };
  }
}

function ServerCard({ server, onConnect, isConnected }: ServerCardProps) {
  const colors = getProtocolColors(server.protocol);
  const isLocked = server.inUse && !isConnected;

  return (
    <div className={`bg-white rounded-xl shadow-sm p-6 hover:shadow-lg transition-all duration-200 flex flex-col ${isConnected ? 'ring-2 ring-green-500' : isLocked ? 'opacity-75' : 'hover:translate-y-[-2px]'}`}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className={`w-11 h-11 rounded-lg flex items-center justify-center shrink-0 ${colors.bg}`}>
            {getProtocolIcon(server.protocol, `w-6 h-6 ${colors.icon}`)}
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-gray-900 break-words">{server.name}</h3>
            <p className="text-sm text-gray-500 font-mono break-all">{server.host}:{server.port}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={`px-2.5 py-1 rounded-md text-xs font-semibold uppercase tracking-wide ${colors.bg} ${colors.text}`}>
            {server.protocol}
          </span>
          {isLocked && (
            <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-100 text-amber-700 whitespace-nowrap">
              In Use
            </span>
          )}
        </div>
      </div>

      {server.description && (
        <p className="text-sm text-gray-600 mb-4">{server.description}</p>
      )}

      {isLocked && server.activeUser && (
        <p className="text-xs text-amber-600 mb-3">Currently used by {server.activeUser}</p>
      )}

      <div className="mt-auto" />
      <button
        onClick={() => onConnect(server.id)}
        disabled={isConnected || isLocked}
        className={`w-full px-4 py-2.5 rounded-lg transition-all duration-200 font-medium ${
          isConnected
            ? 'bg-green-100 text-green-700 cursor-default'
            : isLocked
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-brand-navy text-white hover:bg-brand-blue active:scale-[0.98]'
        }`}
      >
        {isConnected ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
            Connected
          </span>
        ) : isLocked ? (
          'Unavailable'
        ) : (
          'Connect'
        )}
      </button>
    </div>
  );
}
