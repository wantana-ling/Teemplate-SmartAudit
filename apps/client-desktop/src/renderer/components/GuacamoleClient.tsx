import { useEffect, useRef, useState, useCallback } from 'react';
import Guacamole from 'guacamole-common-js';
import { api } from '../services/api';

interface GuacamoleClientProps {
  sessionId: string;
  token: string;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onError?: (error: string) => void;
  onKeystroke?: (count: number) => void;
}

// Screenshot capture interval (5 seconds)
const SCREENSHOT_INTERVAL = 5000;

export default function GuacamoleClient({
  sessionId,
  token,
  onConnected,
  onDisconnected,
  onError,
  onKeystroke,
}: GuacamoleClientProps) {
  const displayRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<Guacamole.Client | null>(null);
  const keyboardRef = useRef<Guacamole.Keyboard | null>(null);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>(
    'connecting'
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const keystrokeCountRef = useRef(0);
  const [keystrokeDisplay, setKeystrokeDisplay] = useState(0);
  const mountedRef = useRef(true);
  const scaleRef = useRef(1);
  const screenshotIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const displayInstanceRef = useRef<Guacamole.Display | null>(null);

  // Store callbacks in refs to avoid re-running effect
  const callbacksRef = useRef({ onConnected, onDisconnected, onError, onKeystroke });
  callbacksRef.current = { onConnected, onDisconnected, onError, onKeystroke };

  // Capture and send screenshot for late-join viewers
  const captureAndSendScreenshot = useCallback(async () => {
    if (!displayInstanceRef.current || !mountedRef.current) return;

    try {
      const display = displayInstanceRef.current;
      const width = display.getWidth();
      const height = display.getHeight();

      if (width <= 0 || height <= 0) return;

      // Use toCanvas() to get a clean copy (avoids potential tainted canvas issues)
      const defaultLayer = display.getDefaultLayer();
      const canvas = defaultLayer.toCanvas();

      if (!canvas || canvas.width <= 0 || canvas.height <= 0) return;

      const dataUrl = canvas.toDataURL('image/jpeg', 0.7);

      // Send to backend
      const result = await api.post(`/api/sessions/${sessionId}/screenshot`, {
        image: dataUrl,
        width,
        height,
        timestamp: Date.now(),
      });

      if (!result.success) {
        console.warn('[Screenshot] POST failed:', result.error);
      }
    } catch (error) {
      console.warn('[Screenshot] Capture failed:', error);
    }
  }, [sessionId]);

  // Start screenshot capture interval
  const startScreenshotCapture = useCallback(() => {
    if (screenshotIntervalRef.current) return;

    // Capture immediately on connect
    setTimeout(() => captureAndSendScreenshot(), 1000);

    // Then capture periodically
    screenshotIntervalRef.current = setInterval(
      captureAndSendScreenshot,
      SCREENSHOT_INTERVAL
    );
  }, [captureAndSendScreenshot]);

  // Stop screenshot capture interval
  const stopScreenshotCapture = useCallback(() => {
    if (screenshotIntervalRef.current) {
      clearInterval(screenshotIntervalRef.current);
      screenshotIntervalRef.current = null;
    }
  }, []);

  // Handle disconnect
  const disconnect = useCallback(() => {
    if (clientRef.current) {
      try {
        clientRef.current.disconnect();
      } catch (e) {
        // Ignore errors during disconnect
      }
      clientRef.current = null;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    if (!displayRef.current || !token) return;

    // Build WebSocket URL
    let backendWsUrl = import.meta.env.VITE_BACKEND_WS_URL || 'ws://localhost:8080';
    // Remove trailing /ws if present
    backendWsUrl = backendWsUrl.replace(/\/ws\/?$/, '');
    const wsUrl = `${backendWsUrl}/ws?token=${encodeURIComponent(token)}`;

    // Create WebSocket tunnel
    const tunnel = new Guacamole.WebSocketTunnel(wsUrl);

    // Create Guacamole client
    const client = new Guacamole.Client(tunnel);
    clientRef.current = client;

    // Get the display element
    const display = client.getDisplay();
    displayInstanceRef.current = display;
    const displayElement = display.getElement();

    // Style the display element for proper cursor tracking
    displayElement.style.cursor = 'none'; // Hide local cursor, show remote cursor

    // Add display to container
    const container = displayRef.current;
    container.innerHTML = '';
    container.appendChild(displayElement);

    // Handle state changes
    client.onstatechange = (state: number) => {
      if (!mountedRef.current) return;

      switch (state) {
        case 0: // IDLE
        case 1: // CONNECTING
        case 2: // WAITING
          setStatus('connecting');
          break;
        case 3: // CONNECTED
          setStatus('connected');
          callbacksRef.current.onConnected?.();
          // Start screenshot capture for late-join viewers
          startScreenshotCapture();
          break;
        case 4: // DISCONNECTING
        case 5: // DISCONNECTED
          setStatus('disconnected');
          stopScreenshotCapture();
          callbacksRef.current.onDisconnected?.();
          break;
      }
    };

    // Handle errors
    client.onerror = (error: Guacamole.Status) => {
      if (!mountedRef.current) return;

      console.error('[Guacamole] Error:', error);
      const message = error.message || `Error code: ${error.code}`;
      setStatus('error');
      setErrorMessage(message);
      callbacksRef.current.onError?.(message);
    };

    // Handle clipboard from remote
    client.onclipboard = (stream: Guacamole.InputStream, mimetype: string) => {
      if (mimetype === 'text/plain') {
        const reader = new Guacamole.StringReader(stream);
        let data = '';

        reader.ontext = (text: string) => {
          data += text;
        };

        reader.onend = () => {
          navigator.clipboard.writeText(data).catch(console.error);
        };
      }
    };

    // Set up keyboard - attach to container, not document
    // This allows clicking buttons outside the remote display
    const keyboard = new Guacamole.Keyboard(container);
    keyboardRef.current = keyboard;

    keyboard.onkeydown = (keysym: number) => {
      if (!mountedRef.current) return;
      client.sendKeyEvent(1, keysym);
      keystrokeCountRef.current += 1;
      setKeystrokeDisplay(keystrokeCountRef.current);
      callbacksRef.current.onKeystroke?.(keystrokeCountRef.current);
    };

    keyboard.onkeyup = (keysym: number) => {
      client.sendKeyEvent(0, keysym);
    };

    // Set up mouse - coordinates need to be scaled from visual to remote display space
    const mouse = new Guacamole.Mouse(displayElement);

    const sendScaledMouseState = (mouseState: Guacamole.Mouse.State) => {
      const scale = scaleRef.current;

      // Create a new state with scaled coordinates
      // Don't mutate the original state
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

    // Handle touch events
    const touch = new Guacamole.Mouse.Touchpad(displayElement);
    touch.onmousedown = sendScaledMouseState;
    touch.onmouseup = sendScaledMouseState;
    touch.onmousemove = sendScaledMouseState;

    // Handle display resize
    const handleResize = () => {
      if (!displayRef.current || !mountedRef.current) return;

      const containerEl = displayRef.current;
      const containerWidth = containerEl.clientWidth;
      const containerHeight = containerEl.clientHeight;

      const displayWidth = display.getWidth();
      const displayHeight = display.getHeight();

      if (displayWidth > 0 && displayHeight > 0) {
        const scaleX = containerWidth / displayWidth;
        const scaleY = containerHeight / displayHeight;
        const scale = Math.min(scaleX, scaleY);
        scaleRef.current = scale;
        display.scale(scale);
      }
    };

    display.onresize = handleResize;
    window.addEventListener('resize', handleResize);

    // Focus the container to receive keyboard events
    container.focus();

    // Connect to the server
    client.connect('');

    // Cleanup
    return () => {
      mountedRef.current = false;
      stopScreenshotCapture();
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
      displayInstanceRef.current = null;

      if (clientRef.current) {
        try {
          clientRef.current.disconnect();
        } catch (e) {
          // Ignore
        }
        clientRef.current = null;
      }
    };
  }, [token, sessionId, startScreenshotCapture, stopScreenshotCapture]); // Only depend on token and sessionId

  // Render error state
  if (status === 'error') {
    return (
      <div className="flex items-center justify-center h-full bg-gray-900">
        <div className="text-center text-white p-8">
          <div className="text-6xl mb-4">&#x26A0;</div>
          <h2 className="text-xl font-semibold mb-2">Connection Error</h2>
          <p className="text-gray-400 mb-4">{errorMessage || 'Failed to connect to remote server'}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  // Render disconnected state
  if (status === 'disconnected') {
    return (
      <div className="flex items-center justify-center h-full bg-gray-900">
        <div className="text-center text-white p-8">
          <div className="text-6xl mb-4">&#x1F50C;</div>
          <h2 className="text-xl font-semibold mb-2">Disconnected</h2>
          <p className="text-gray-400">Connection to remote server was closed</p>
        </div>
      </div>
    );
  }

  // Focus the display container when clicking on it
  const handleContainerClick = () => {
    displayRef.current?.focus();
  };

  return (
    <div className="w-full h-full relative bg-black">
      {/* Guacamole display container */}
      <div
        ref={displayRef}
        className="w-full h-full flex items-center justify-center"
        tabIndex={0}
        style={{ outline: 'none', cursor: 'none' }}
        onClick={handleContainerClick}
      />

      {/* Connecting overlay */}
      {status === 'connecting' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-75">
          <div className="text-center text-white">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
            <p className="text-lg">Connecting to remote server...</p>
            <p className="text-sm text-gray-400 mt-2">Session: {sessionId.slice(0, 8)}...</p>
          </div>
        </div>
      )}

      {/* Keystroke counter */}
      {status === 'connected' && keystrokeDisplay > 0 && (
        <div className="absolute bottom-4 right-4 bg-black bg-opacity-50 text-white px-3 py-1 rounded text-sm">
          Keystrokes: {keystrokeDisplay}
        </div>
      )}
    </div>
  );
}
