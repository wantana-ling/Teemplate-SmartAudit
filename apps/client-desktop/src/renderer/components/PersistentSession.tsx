import { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Guacamole from 'guacamole-common-js';
import { useActiveSession } from '../contexts/ActiveSessionContext';
import { useSessionStore } from '../stores/sessionStore';

// Format duration as HH:MM:SS
function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export default function PersistentSession() {
  const location = useLocation();
  const navigate = useNavigate();
  const { activeSession, endSession: clearActiveSession } = useActiveSession();
  const { endSession: endSessionAPI } = useSessionStore();

  const displayRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<Guacamole.Client | null>(null);
  const keyboardRef = useRef<Guacamole.Keyboard | null>(null);
  const scaleRef = useRef(1);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isEnding, setIsEnding] = useState(false);
  const mountedRef = useRef(true);
  const userInitiatedEndRef = useRef(false); // Track if user clicked End Session

  // Session duration timer
  const [sessionDuration, setSessionDuration] = useState(0);
  const sessionStartRef = useRef<number | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Floating control bar visibility
  const [showControls, setShowControls] = useState(false);
  const hideControlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Check if we're on the session page
  const isOnSessionPage = location.pathname.startsWith('/session/');

  // Start duration timer when connected
  useEffect(() => {
    if (status === 'connected' && !sessionStartRef.current) {
      sessionStartRef.current = Date.now();
      durationIntervalRef.current = setInterval(() => {
        if (sessionStartRef.current) {
          const elapsed = Math.floor((Date.now() - sessionStartRef.current) / 1000);
          setSessionDuration(elapsed);
        }
      }, 1000);
    }

    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
    };
  }, [status]);

  // Reset state when session ends or new session starts
  useEffect(() => {
    if (!activeSession) {
      // Session ended - reset all state
      sessionStartRef.current = null;
      setSessionDuration(0);
      setIsEnding(false);
      userInitiatedEndRef.current = false;
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
    } else {
      // New session started - reset ending state
      setIsEnding(false);
      userInitiatedEndRef.current = false;
    }
  }, [activeSession]);

  // Connect when activeSession changes
  useEffect(() => {
    if (!activeSession || !displayRef.current) return;

    mountedRef.current = true;
    setStatus('connecting');
    setErrorMessage(null);

    // Build WebSocket URL
    let backendWsUrl = import.meta.env.VITE_BACKEND_WS_URL || 'ws://localhost:8080';
    backendWsUrl = backendWsUrl.replace(/\/ws\/?$/, '');
    const wsUrl = `${backendWsUrl}/ws?token=${encodeURIComponent(activeSession.token)}`;

    // Create WebSocket tunnel
    const tunnel = new Guacamole.WebSocketTunnel(wsUrl);

    // Handle tunnel errors and state changes
    tunnel.onerror = (status: Guacamole.Status) => {
      if (mountedRef.current) {
        setStatus('error');
        setErrorMessage(status.message || 'Connection error');
      }
    };

    tunnel.onstatechange = (state: number) => {
      // Tunnel states: 0=CONNECTING, 1=OPEN, 2=CLOSED
      if (state === 2 && mountedRef.current) { // CLOSED
        setStatus('disconnected');

        // Only show alert if NOT user-initiated (i.e., admin terminated)
        if (!userInitiatedEndRef.current) {
          alert('Session has been terminated. This may have been done by an administrator.');
          if (activeSession?.sessionId) {
            endSessionAPI(activeSession.sessionId).catch(err => {
              console.error('[PersistentSession] Failed to notify backend:', err);
            });
          }
          clearActiveSession();
          navigate('/servers');
        }
      }
    };

    const client = new Guacamole.Client(tunnel);
    clientRef.current = client;

    // Get the display element
    const display = client.getDisplay();
    const displayElement = display.getElement();
    displayElement.style.cursor = 'none';

    // Add display to container
    const container = displayRef.current;
    container.innerHTML = '';
    container.appendChild(displayElement);

    // Handle state changes
    client.onstatechange = (state: number) => {
      if (!mountedRef.current) return;

      switch (state) {
        case 0: case 1: case 2:
          setStatus('connecting');
          break;
        case 3:
          setStatus('connected');
          break;
        case 4: case 5:
          setStatus('disconnected');
          // Automatically end the session when disconnected
          // This handles both: user ending session and auditor terminating session
          if (activeSession?.sessionId) {
            endSessionAPI(activeSession.sessionId).catch(err => {
              console.error('[PersistentSession] Failed to notify backend of session end:', err);
            });
          }
          clearActiveSession();
          break;
      }
    };

    // Handle errors
    client.onerror = (error: Guacamole.Status) => {
      if (!mountedRef.current) return;
      console.error('[PersistentSession] Error:', error);
      const message = error.message || `Error code: ${error.code}`;
      setStatus('error');
      setErrorMessage(message);
    };

    // Handle clipboard
    client.onclipboard = (stream: Guacamole.InputStream, mimetype: string) => {
      if (mimetype === 'text/plain') {
        const reader = new Guacamole.StringReader(stream);
        let data = '';
        reader.ontext = (text: string) => { data += text; };
        reader.onend = () => { navigator.clipboard.writeText(data).catch(console.error); };
      }
    };

    // Set up keyboard
    const keyboard = new Guacamole.Keyboard(container);
    keyboardRef.current = keyboard;

    keyboard.onkeydown = (keysym: number) => {
      if (!mountedRef.current) return;
      client.sendKeyEvent(1, keysym);
    };

    keyboard.onkeyup = (keysym: number) => {
      client.sendKeyEvent(0, keysym);
    };

    // Set up mouse
    const mouse = new Guacamole.Mouse(displayElement);

    const sendScaledMouseState = (mouseState: Guacamole.Mouse.State) => {
      const scale = scaleRef.current;
      const scaledState = new Guacamole.Mouse.State(
        Math.floor(mouseState.x / scale),
        Math.floor(mouseState.y / scale),
        mouseState.left,
        mouseState.middle,
        mouseState.right,
        mouseState.up,
        mouseState.down
      );
      client.sendMouseState(scaledState);
    };

    mouse.onmousedown = sendScaledMouseState;
    mouse.onmouseup = sendScaledMouseState;
    mouse.onmousemove = sendScaledMouseState;

    // Touch events
    const touch = new Guacamole.Mouse.Touchpad(displayElement);
    touch.onmousedown = sendScaledMouseState;
    touch.onmouseup = sendScaledMouseState;
    touch.onmousemove = sendScaledMouseState;

    // Handle resize
    const handleResize = () => {
      if (!displayRef.current || !mountedRef.current) return;
      const containerEl = displayRef.current;
      const displayWidth = display.getWidth();
      const displayHeight = display.getHeight();

      if (displayWidth > 0 && displayHeight > 0) {
        const scaleX = containerEl.clientWidth / displayWidth;
        const scaleY = containerEl.clientHeight / displayHeight;
        const scale = Math.min(scaleX, scaleY);
        scaleRef.current = scale;
        display.scale(scale);
      }
    };

    display.onresize = handleResize;
    window.addEventListener('resize', handleResize);

    // Focus and connect
    container.focus();
    client.connect('');

    // Cleanup only when activeSession is cleared (not on navigate)
    return () => {
      mountedRef.current = false;
      keyboard.onkeydown = null;
      keyboard.onkeyup = null;
      keyboardRef.current = null;
      mouse.onmousedown = null;
      mouse.onmouseup = null;
      mouse.onmousemove = null;
      touch.onmousedown = null;
      touch.onmouseup = null;
      touch.onmousemove = null;
      window.removeEventListener('resize', handleResize);

      if (clientRef.current) {
        try {
          clientRef.current.disconnect();
        } catch (e) {
          // Ignore
        }
        clientRef.current = null;
      }
    };
  }, [activeSession]);

  // Focus the container when navigating back to session page
  useEffect(() => {
    if (isOnSessionPage && displayRef.current) {
      displayRef.current.focus();
    }
  }, [isOnSessionPage]);

  const handleEndSession = () => {
    // Mark as user-initiated to prevent admin terminate alert
    userInitiatedEndRef.current = true;

    // Immediate visual feedback
    setIsEnding(true);

    // Disconnect the client immediately for instant feedback
    if (clientRef.current) {
      try {
        clientRef.current.disconnect();
      } catch (e) {
        // Ignore disconnect errors
      }
      clientRef.current = null;
    }

    // Clear session and navigate immediately
    const sessionId = activeSession?.sessionId;
    clearActiveSession();
    navigate('/servers');

    // Notify backend in background (don't wait for it)
    if (sessionId) {
      endSessionAPI(sessionId).catch(err => {
        console.error('Failed to notify backend of session end:', err);
      });
    }
  };

  const handleContainerClick = () => {
    displayRef.current?.focus();
  };

  // Handle mouse movement to show/hide controls
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    // Show controls when mouse is near the top of the screen
    if (e.clientY < 60) {
      setShowControls(true);
      // Clear any pending hide timeout
      if (hideControlsTimeoutRef.current) {
        clearTimeout(hideControlsTimeoutRef.current);
        hideControlsTimeoutRef.current = null;
      }
    }
  }, []);

  const handleControlsMouseEnter = useCallback(() => {
    setShowControls(true);
    if (hideControlsTimeoutRef.current) {
      clearTimeout(hideControlsTimeoutRef.current);
      hideControlsTimeoutRef.current = null;
    }
  }, []);

  const handleControlsMouseLeave = useCallback(() => {
    // Hide controls after a short delay
    hideControlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 500);
  }, []);

  // Don't render if no active session
  if (!activeSession) return null;

  // Full-screen view when on session page
  if (isOnSessionPage) {
    return (
      <div
        className="fixed inset-0 z-50 bg-black"
        onMouseMove={handleMouseMove}
      >
        {/* Floating Control Bar - appears on hover */}
        <div
          className={`absolute top-0 left-0 right-0 z-50 transition-all duration-300 ease-in-out ${
            showControls ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'
          }`}
          onMouseEnter={handleControlsMouseEnter}
          onMouseLeave={handleControlsMouseLeave}
        >
          <div className="bg-white/95 backdrop-blur-sm border-b border-gray-200 shadow-lg px-4 py-2.5 flex items-center justify-between">
            {/* Left: Server info */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${status === 'connected' ? 'bg-green-500' : status === 'connecting' ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'}`}></div>
                <span className="text-gray-900 font-medium">{activeSession.serverName}</span>
              </div>
              <span className="text-gray-300">|</span>
              <span className="text-gray-500 text-sm font-mono">{activeSession.sessionId.slice(0, 8)}</span>
            </div>

            {/* Center: Status indicators */}
            <div className="flex items-center gap-3">
              {/* Duration Timer */}
              <div className="flex items-center gap-1.5 text-gray-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm font-mono">{formatDuration(sessionDuration)}</span>
              </div>

              {/* Recording Indicator */}
              <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 px-2 py-1 rounded">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                <span className="text-xs font-medium text-red-600">REC</span>
              </div>
            </div>

            {/* Right: End Session Button */}
            <button
              onClick={handleEndSession}
              disabled={isEnding}
              className="px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-500 transition-colors text-sm font-medium flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isEnding ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Ending...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  End Session
                </>
              )}
            </button>
          </div>
        </div>

        {/* Hover trigger zone at top - invisible */}
        <div
          className="absolute top-0 left-0 right-0 h-4 z-40"
          onMouseEnter={() => setShowControls(true)}
        />

        {/* Remote Desktop View - Full screen */}
        <div className="w-full h-full overflow-hidden relative">
          <div
            ref={displayRef}
            className="w-full h-full flex items-center justify-center"
            tabIndex={0}
            style={{ outline: 'none', cursor: 'none' }}
            onClick={handleContainerClick}
          />

          {/* Minimal floating indicator when controls hidden */}
          {!showControls && status === 'connected' && (
            <div
              className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/50 backdrop-blur-sm px-3 py-1.5 rounded-full cursor-pointer hover:bg-black/70 transition-colors"
              onClick={() => setShowControls(true)}
            >
              <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></div>
              <span className="text-white/80 text-xs font-mono">{formatDuration(sessionDuration)}</span>
            </div>
          )}

          {status === 'connecting' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/90">
              <div className="text-center text-white">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
                <p className="text-lg">Connecting to {activeSession.serverName}</p>
                <p className="text-sm text-gray-400 mt-2">Please wait...</p>
              </div>
            </div>
          )}

          {status === 'error' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/90">
              <div className="text-center text-white p-8 max-w-md">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
                  <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold mb-2">Connection Error</h2>
                <p className="text-gray-400 mb-6">{errorMessage}</p>
                <button
                  onClick={handleEndSession}
                  className="px-6 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-500 transition-colors font-medium"
                >
                  Close Session
                </button>
              </div>
            </div>
          )}

          {status === 'disconnected' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/90">
              <div className="text-center text-white p-8 max-w-md">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-500/20 flex items-center justify-center">
                  <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold mb-2">Session Disconnected</h2>
                <p className="text-gray-400 mb-6">The connection was closed</p>
                <button
                  onClick={handleEndSession}
                  className="px-6 py-2.5 bg-brand-navy text-white rounded-lg hover:bg-brand-blue transition-colors font-medium"
                >
                  Return to Servers
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Mini indicator when on other pages (session still running in background)
  return (
    <div
      onClick={() => navigate(`/session/${activeSession.serverId}`)}
      className="fixed bottom-4 right-4 z-50 bg-brand-navy text-white px-4 py-3 rounded-xl shadow-lg cursor-pointer hover:bg-brand-blue transition-all duration-200 hover:scale-105"
    >
      <div className="flex items-center gap-3">
        <div className="relative">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
          <div className="absolute -top-1 -right-1 w-1.5 h-1.5 bg-red-500 rounded-full"></div>
        </div>
        <div>
          <p className="font-medium text-sm">{activeSession.serverName}</p>
          <div className="flex items-center gap-2 text-xs text-white/70">
            <span>{formatDuration(sessionDuration)}</span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-red-400 rounded-full animate-pulse"></span>
              REC
            </span>
          </div>
        </div>
        <svg className="w-4 h-4 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </div>
  );
}
