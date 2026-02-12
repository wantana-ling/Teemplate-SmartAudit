import { useEffect, useRef, useState, useCallback } from 'react';
import Guacamole from 'guacamole-common-js';

interface GuacamoleDisplayProps {
  // For live streaming
  mode: 'live' | 'playback';
  sessionId?: string;
  // For playback
  recordingUrl?: string;
  // Callbacks
  onError?: (error: string) => void;
  onStateChange?: (state: 'loading' | 'playing' | 'paused' | 'ended' | 'error') => void;
}

interface PlaybackControls {
  play: () => void;
  pause: () => void;
  seek: (position: number) => void;
  getDuration: () => number;
  getPosition: () => number;
}

export default function GuacamoleDisplay({
  mode,
  sessionId,
  recordingUrl,
  onError,
  onStateChange,
}: GuacamoleDisplayProps) {
  const displayRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<Guacamole.Client | null>(null);
  const recordingRef = useRef<Guacamole.SessionRecording | null>(null);
  const [state, setState] = useState<'loading' | 'playing' | 'paused' | 'ended' | 'error'>('loading');
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const positionIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Update parent component when state changes
  useEffect(() => {
    onStateChange?.(state);
  }, [state, onStateChange]);

  // Initialize display for live mode
  const initLiveDisplay = useCallback(() => {
    if (!displayRef.current) return;

    // Clear any existing display
    displayRef.current.innerHTML = '';

    // Create a new client with a dummy tunnel (we'll feed data manually)
    const tunnel = new Guacamole.StaticHTTPTunnel('');
    const client = new Guacamole.Client(tunnel);
    clientRef.current = client;

    // Get display element and add to DOM
    const display = client.getDisplay();
    const element = display.getElement();
    element.style.width = '100%';
    element.style.height = '100%';
    displayRef.current.appendChild(element);

    // Handle display resize
    const resizeDisplay = () => {
      if (!displayRef.current) return;
      const width = displayRef.current.clientWidth;
      const height = displayRef.current.clientHeight;
      display.scale(Math.min(width / display.getWidth(), height / display.getHeight()) || 1);
    };

    const resizeObserver = new ResizeObserver(resizeDisplay);
    resizeObserver.observe(displayRef.current);

    setState('playing');

    return () => {
      resizeObserver.disconnect();
      client.disconnect();
    };
  }, []);

  // Initialize display for playback mode
  const initPlaybackDisplay = useCallback(async () => {
    if (!displayRef.current || !recordingUrl) return;

    setState('loading');

    try {
      // Clear any existing display
      displayRef.current.innerHTML = '';

      // Fetch the recording file
      const response = await fetch(recordingUrl);
      if (!response.ok) {
        throw new Error('Failed to fetch recording');
      }

      const blob = await response.blob();
      const tunnel = new Guacamole.StaticHTTPTunnel(URL.createObjectURL(blob));

      // Create recording from tunnel
      const recording = new Guacamole.SessionRecording(tunnel);
      recordingRef.current = recording;

      // Get display
      const display = recording.getDisplay();
      const element = display.getElement();
      element.style.width = '100%';
      element.style.height = '100%';
      displayRef.current.appendChild(element);

      // Handle recording events
      recording.onplay = () => {
        setState('playing');
        startPositionTracking();
      };

      recording.onpause = () => {
        setState('paused');
        stopPositionTracking();
      };

      recording.onseek = (millis: number) => {
        setPosition(millis);
      };

      recording.onprogress = (millis: number) => {
        setDuration(millis);
      };

      // Connect and start playing
      recording.connect();

      // Handle display resize
      const resizeDisplay = () => {
        if (!displayRef.current) return;
        const width = displayRef.current.clientWidth;
        const height = displayRef.current.clientHeight;
        const scale = Math.min(
          width / (display.getWidth() || width),
          height / (display.getHeight() || height)
        ) || 1;
        display.scale(scale);
      };

      const resizeObserver = new ResizeObserver(resizeDisplay);
      resizeObserver.observe(displayRef.current);

      // Auto-play
      setTimeout(() => {
        recording.play();
      }, 500);

      return () => {
        resizeObserver.disconnect();
        recording.disconnect();
        stopPositionTracking();
      };
    } catch (error: any) {
      console.error('Failed to load recording:', error);
      setState('error');
      onError?.(error.message || 'Failed to load recording');
    }
  }, [recordingUrl, onError]);

  // Position tracking for playback
  const startPositionTracking = useCallback(() => {
    if (positionIntervalRef.current) return;
    positionIntervalRef.current = setInterval(() => {
      if (recordingRef.current) {
        setPosition(recordingRef.current.getPosition());
      }
    }, 100);
  }, []);

  const stopPositionTracking = useCallback(() => {
    if (positionIntervalRef.current) {
      clearInterval(positionIntervalRef.current);
      positionIntervalRef.current = null;
    }
  }, []);

  // Initialize based on mode
  useEffect(() => {
    if (mode === 'live') {
      return initLiveDisplay();
    } else if (mode === 'playback' && recordingUrl) {
      initPlaybackDisplay();
    }

    return () => {
      stopPositionTracking();
    };
  }, [mode, recordingUrl, initLiveDisplay, initPlaybackDisplay, stopPositionTracking]);

  // Feed live data to the display
  const feedLiveData = useCallback((data: string) => {
    if (!clientRef.current) return;

    try {
      // Parse and send instruction to client
      const parser = new Guacamole.Parser();
      parser.oninstruction = (opcode: string, args: string[]) => {
        // Reconstruct the instruction and send to display
        clientRef.current?.getDisplay();
      };
      parser.receive(data);
    } catch (error) {
      console.error('Error feeding live data:', error);
    }
  }, []);

  // Playback controls
  const handlePlayPause = useCallback(() => {
    if (!recordingRef.current) return;

    if (state === 'playing') {
      recordingRef.current.pause();
    } else {
      recordingRef.current.play();
    }
  }, [state]);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!recordingRef.current) return;
    const newPosition = parseInt(e.target.value, 10);
    recordingRef.current.seek(newPosition);
  }, []);

  const handleSpeedChange = useCallback((speed: number) => {
    setPlaybackSpeed(speed);
    // Note: guacamole-common-js doesn't natively support speed changes
    // This would require custom implementation
  }, []);

  const formatTime = (millis: number) => {
    const seconds = Math.floor(millis / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    const remainingSeconds = seconds % 60;

    if (hours > 0) {
      return `${hours}:${remainingMinutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  // Expose feedLiveData for parent component
  useEffect(() => {
    if (mode === 'live' && displayRef.current) {
      (displayRef.current as any).feedLiveData = feedLiveData;
    }
  }, [mode, feedLiveData]);

  return (
    <div className="flex flex-col h-full bg-black">
      {/* Display Area */}
      <div
        ref={displayRef}
        className="flex-1 relative overflow-hidden flex items-center justify-center"
        style={{ minHeight: '300px' }}
      >
        {state === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
            <div className="text-center text-white">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
              <p>Loading {mode === 'live' ? 'live stream' : 'recording'}...</p>
            </div>
          </div>
        )}

        {state === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
            <div className="text-center text-white">
              <svg className="w-16 h-16 mx-auto mb-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <p className="text-red-400">Failed to load {mode === 'live' ? 'stream' : 'recording'}</p>
            </div>
          </div>
        )}

        {mode === 'live' && state === 'playing' && (
          <div className="absolute top-4 right-4 flex items-center gap-2 bg-black/50 px-3 py-1 rounded-full">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
            <span className="text-white text-sm">LIVE</span>
          </div>
        )}
      </div>

      {/* Playback Controls (only for playback mode) */}
      {mode === 'playback' && (
        <div className="bg-gray-800 p-4">
          {/* Progress Bar */}
          <div className="mb-3">
            <input
              type="range"
              min={0}
              max={duration}
              value={position}
              onChange={handleSeek}
              className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, #3B82F6 0%, #3B82F6 ${(position / duration) * 100}%, #4B5563 ${(position / duration) * 100}%, #4B5563 100%)`,
              }}
            />
          </div>

          {/* Controls Row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* Play/Pause Button */}
              <button
                onClick={handlePlayPause}
                className="w-10 h-10 flex items-center justify-center bg-primary-600 hover:bg-primary-700 text-white rounded-full transition-colors"
              >
                {state === 'playing' ? (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>

              {/* Time Display */}
              <div className="text-white text-sm font-mono">
                {formatTime(position)} / {formatTime(duration)}
              </div>
            </div>

            {/* Speed Controls */}
            <div className="flex items-center gap-2">
              <span className="text-gray-400 text-sm">Speed:</span>
              {[0.5, 1, 1.5, 2].map((speed) => (
                <button
                  key={speed}
                  onClick={() => handleSpeedChange(speed)}
                  className={`px-2 py-1 text-sm rounded ${
                    playbackSpeed === speed
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {speed}x
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Export type for parent component to use
export type { GuacamoleDisplayProps, PlaybackControls };
