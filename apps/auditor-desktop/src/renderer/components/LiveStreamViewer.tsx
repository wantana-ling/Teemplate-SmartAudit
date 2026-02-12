import { useEffect, useRef, useState, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import Guacamole from 'guacamole-common-js';

interface LiveStreamViewerProps {
  socket: Socket | null;
  sessionId: string;
  isConnected: boolean;
  onFullscreen?: () => void;
}

interface ScreenshotData {
  sessionId: string;
  image: string;      // Base64 data URL
  width: number;
  height: number;
  timestamp: number;
}

export default function LiveStreamViewer({ socket, sessionId, isConnected, onFullscreen }: LiveStreamViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const displayRef = useRef<HTMLDivElement>(null);
  const parserRef = useRef<Guacamole.Parser | null>(null);
  const clientHandlerRef = useRef<((opcode: string, args: string[]) => void) | null>(null);
  const [status, setStatus] = useState<'connecting' | 'watching' | 'streaming' | 'idle' | 'error'>('connecting');
  const [frameCount, setFrameCount] = useState(0);
  const [dataReceived, setDataReceived] = useState(false);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const lastDataRef = useRef<number>(0);
  const instructionCountRef = useRef(0);

  // Initialize Guacamole client and display — rebuild when sessionId changes
  useEffect(() => {
    if (!displayRef.current) return;

    // Reset per-session state
    instructionCountRef.current = 0;
    setScreenshotUrl(null);

    // Suppress canvas errors globally
    const errorHandler = (event: ErrorEvent) => {
      if (event.message?.includes('width or height of 0') ||
          event.message?.includes('drawImage')) {
        event.preventDefault();
        return true;
      }
    };
    window.addEventListener('error', errorHandler);

    // Create parser
    const parser = new Guacamole.Parser();
    parserRef.current = parser;

    // Create tunnel
    const tunnel = {
      state: Guacamole.Tunnel.State.OPEN,
      uuid: null,
      receiveTimeout: 0,
      unstable: false,
      onerror: null,
      onstatechange: null,
      oninstruction: null,
      connect: () => {},
      disconnect: () => {},
      sendMessage: () => {},
      isConnected: () => true,
    } as Guacamole.Tunnel;

    // Create client
    const client = new Guacamole.Client(tunnel);
    clientHandlerRef.current = tunnel.oninstruction;

    // Forward ALL instructions to client - minimal filtering
    parser.oninstruction = (opcode: string, args: string[]) => {
      // Only filter tiny size instructions that cause errors
      if (opcode === 'size') {
        const layer = args[0];
        const width = parseInt(args[1], 10);
        const height = parseInt(args[2], 10);
        if ((layer === '-1' || layer === '0') && (width < 50 || height < 50)) {
          return; // Skip tiny sizes
        }
      }

      // Forward to client handler
      if (clientHandlerRef.current) {
        try {
          clientHandlerRef.current(opcode, args);
        } catch (e) {
          // Silently ignore errors
        }
      }

      // Count sync frames
      if (opcode === 'sync') {
        setFrameCount(prev => prev + 1);
      }
    };

    // Setup display
    const display = client.getDisplay();
    const element = display.getElement();
    element.style.width = '100%';
    element.style.height = '100%';
    displayRef.current.innerHTML = '';
    displayRef.current.appendChild(element);

    // Resize handler
    const resizeDisplay = () => {
      if (!displayRef.current || !display) return;
      const cw = displayRef.current.clientWidth;
      const ch = displayRef.current.clientHeight;
      const dw = display.getWidth() || cw;
      const dh = display.getHeight() || ch;
      if (dw > 0 && dh > 0) {
        display.scale(Math.min(cw / dw, ch / dh));
      }
    };

    const observer = new ResizeObserver(resizeDisplay);
    observer.observe(displayRef.current);
    display.onresize = resizeDisplay;

    return () => {
      observer.disconnect();
      window.removeEventListener('error', errorHandler);
      parserRef.current = null;
      clientHandlerRef.current = null;
      if (displayRef.current) displayRef.current.innerHTML = '';
    };
  }, [sessionId]);

  // Process data
  const processGuacData = useCallback((data: string) => {
    if (!parserRef.current) return;

    try {
      parserRef.current.receive(data);
      lastDataRef.current = Date.now();
      setDataReceived(true);
    } catch (e) {
      // Silently ignore parse errors
    }
  }, []);

  // Process screenshot for late-join — store as data URL for React-managed <img>
  const processScreenshot = useCallback((data: ScreenshotData) => {
    if (!data.image) return;
    setScreenshotUrl(data.image);
    setStatus('streaming');
    lastDataRef.current = Date.now();
  }, []);

  // Status update
  useEffect(() => {
    if ((dataReceived || screenshotUrl) && status !== 'streaming' && status !== 'idle') {
      setStatus('streaming');
    }
  }, [dataReceived, screenshotUrl, status]);

  // Socket listener
  useEffect(() => {
    if (!socket || !sessionId) return;

    const handleGuacData = (data: { sessionId: string; data: string }) => {
      if (data.sessionId === sessionId) {
        processGuacData(data.data);
      }
    };

    const handleScreenshot = (data: ScreenshotData) => {
      if (data.sessionId === sessionId) {
        processScreenshot(data);
      }
    };

    socket.on('guac-data', handleGuacData);
    socket.on('session-screenshot', handleScreenshot);
    socket.emit('watch-session', sessionId);
    setStatus('watching');

    return () => {
      socket.off('guac-data', handleGuacData);
      socket.off('session-screenshot', handleScreenshot);
      socket.emit('unwatch-session', sessionId);
      setDataReceived(false);
      setScreenshotUrl(null);
      setFrameCount(0);
    };
  }, [socket, sessionId, processGuacData, processScreenshot]);

  // Stale check
  useEffect(() => {
    const interval = setInterval(() => {
      if (lastDataRef.current > 0 && status === 'streaming') {
        if (Date.now() - lastDataRef.current > 10000) {
          setStatus('idle');
        }
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [status]);

  // Connection status
  useEffect(() => {
    if (!isConnected) setStatus('error');
  }, [isConnected]);

  // Fullscreen handling
  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;

    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const getStatusInfo = () => {
    switch (status) {
      case 'connecting':
        return { icon: 'spinner', text: 'Connecting...', color: 'text-gray-400' };
      case 'watching':
        return { icon: 'eye', text: 'Waiting for stream...', color: 'text-blue-400' };
      case 'streaming':
        return { icon: 'live', text: 'LIVE', color: 'text-green-400' };
      case 'idle':
        return { icon: 'pause', text: 'Idle', color: 'text-yellow-400' };
      case 'error':
        return { icon: 'error', text: 'Disconnected', color: 'text-red-400' };
      default:
        return { icon: 'unknown', text: 'Unknown', color: 'text-gray-400' };
    }
  };

  const statusInfo = getStatusInfo();

  return (
    <div
      ref={containerRef}
      className={`relative bg-gray-950 overflow-hidden ${isFullscreen ? 'fixed inset-0 z-50 rounded-none' : ''}`}
    >
      {/* Display Container */}
      <div
        ref={displayRef}
        className="w-full h-full flex items-center justify-center"
        style={{ minHeight: isFullscreen ? '100vh' : '400px', aspectRatio: '16/9' }}
      />

      {/* Screenshot overlay — visible until live Guacamole frames arrive */}
      {screenshotUrl && frameCount === 0 && (
        <img
          src={screenshotUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-contain z-[5] pointer-events-none"
        />
      )}

      {/* Status Overlays */}
      {status === 'connecting' && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-950/90 backdrop-blur-sm">
          <div className="text-center">
            <div className="relative w-12 h-12 mx-auto mb-3">
              <div className="absolute inset-0 rounded-full border-4 border-gray-700"></div>
              <div className="absolute inset-0 rounded-full border-4 border-primary-500 border-t-transparent animate-spin"></div>
            </div>
            <p className="text-gray-400 text-sm">Connecting to stream...</p>
          </div>
        </div>
      )}

      {status === 'watching' && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-950/90 backdrop-blur-sm">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-blue-500/10 flex items-center justify-center">
              <svg className="w-8 h-8 text-blue-400 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            </div>
            <p className="text-blue-300 text-sm font-medium">Waiting for stream data...</p>
            <p className="text-gray-500 text-xs mt-1">Session activity will appear here</p>
          </div>
        </div>
      )}

      {status === 'idle' && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-950/80 backdrop-blur-sm">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-yellow-500/10 flex items-center justify-center">
              <svg className="w-8 h-8 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-yellow-400 text-sm font-medium">Session Idle</p>
            <p className="text-gray-500 text-xs mt-1">No activity for 10+ seconds</p>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-950/90 backdrop-blur-sm">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-red-500/10 flex items-center justify-center">
              <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <p className="text-red-400 text-sm font-medium">Connection Lost</p>
            <p className="text-gray-500 text-xs mt-1">Attempting to reconnect...</p>
          </div>
        </div>
      )}

      {/* Top Status Bar (when streaming) */}
      {status === 'streaming' && (
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between z-20 pointer-events-none">
          {/* Live indicator */}
          <div className="flex items-center gap-2 bg-red-600 shadow-lg px-3 py-1.5 rounded-md pointer-events-auto">
            <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
            <span className="text-white text-xs font-bold tracking-wide">LIVE</span>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2 pointer-events-auto">
            {/* Fullscreen toggle */}
            <button
              onClick={toggleFullscreen}
              className="p-2 bg-black/70 backdrop-blur-sm rounded-lg text-white hover:bg-black transition-colors shadow-lg"
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
                </svg>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Floating Exit Fullscreen Button (always visible in fullscreen) */}
      {isFullscreen && (
        <button
          onClick={toggleFullscreen}
          className="fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-2 bg-gray-900/90 hover:bg-gray-800 text-white rounded-lg shadow-xl transition-colors backdrop-blur-sm"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
          </svg>
          <span className="text-sm font-medium">Exit Fullscreen</span>
        </button>
      )}

      {/* Bottom Stats Bar (when streaming) */}
      {status === 'streaming' && frameCount > 0 && (
        <div className="absolute bottom-0 left-0 right-0 p-3 flex items-center justify-between bg-gradient-to-t from-black/60 to-transparent">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 bg-black/50 backdrop-blur-sm px-2 py-1 rounded text-xs text-gray-300">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
              </svg>
              <span className="font-mono">{frameCount}</span>
            </div>
          </div>

          {/* Session ID badge */}
          <div className="text-xs text-gray-500 font-mono truncate max-w-[200px]">
            {sessionId.slice(0, 8)}...
          </div>
        </div>
      )}
    </div>
  );
}
