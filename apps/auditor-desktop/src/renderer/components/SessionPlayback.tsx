import { useEffect, useRef, useState, useCallback } from 'react';
import Guacamole from 'guacamole-common-js';

interface SessionPlaybackProps {
  recordingUrl: string;
  sessionName?: string;
  sessionDate?: string;
  sessionDuration?: number;  // Add session duration from backend
  onClose?: () => void;
  onError?: (error: string) => void;
}

const PLAYBACK_SPEEDS = [0.5, 1, 1.5, 2];
const CONTROLS_HIDE_DELAY = 3000; // Hide controls after 3 seconds of inactivity

export default function SessionPlayback({ recordingUrl, sessionName, sessionDate, sessionDuration, onClose, onError }: SessionPlaybackProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const displayContainerRef = useRef<HTMLDivElement>(null);
  const guacDisplayRef = useRef<HTMLDivElement | null>(null);
  const recordingRef = useRef<Guacamole.SessionRecording | null>(null);
  const displayRef = useRef<Guacamole.Display | null>(null);
  const initializedRef = useRef(false);
  const mountedRef = useRef(true);
  const seekingRef = useRef(false);
  const [state, setState] = useState<'loading' | 'playing' | 'paused' | 'ended' | 'error'>('loading');
  const [loaded, setLoaded] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const positionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const hideControlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const durationRef = useRef(0);
  const playStartPositionRef = useRef(0);
  const playStartTimeRef = useRef(0);
  const seekTargetRef = useRef<number | null>(null);

  // Format time from milliseconds
  const formatTime = (millis: number) => {
    const totalSeconds = Math.floor(millis / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Keep durationRef in sync
  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  // Auto-hide controls logic
  const resetHideControlsTimer = useCallback(() => {
    setShowControls(true);
    if (hideControlsTimeoutRef.current) {
      clearTimeout(hideControlsTimeoutRef.current);
    }
    // Only auto-hide when playing
    if (state === 'playing') {
      hideControlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, CONTROLS_HIDE_DELAY);
    }
  }, [state]);

  // Handle mouse movement to show controls
  const handleMouseMove = useCallback(() => {
    resetHideControlsTimer();
  }, [resetHideControlsTimer]);

  // Handle mouse leave to hide controls faster
  const handleMouseLeave = useCallback(() => {
    if (state === 'playing') {
      if (hideControlsTimeoutRef.current) {
        clearTimeout(hideControlsTimeoutRef.current);
      }
      hideControlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 500);
    }
  }, [state]);

  // Show controls when paused/ended
  useEffect(() => {
    if (state !== 'playing') {
      setShowControls(true);
      if (hideControlsTimeoutRef.current) {
        clearTimeout(hideControlsTimeoutRef.current);
      }
    } else {
      resetHideControlsTimer();
    }
  }, [state, resetHideControlsTimer]);

  // Initialize recording
  useEffect(() => {
    if (initializedRef.current) return;
    if (!displayContainerRef.current || !recordingUrl) return;

    initializedRef.current = true;
    mountedRef.current = true;
    let recording: Guacamole.SessionRecording | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let positionInterval: NodeJS.Timeout | null = null;

    // Handle unhandled promise rejections (abort errors and canvas errors from unmount/resize)
    const unhandledRejectionHandler = (event: PromiseRejectionEvent) => {
      const message = event.reason?.message || String(event.reason);
      // Suppress abort errors
      if (message.includes('aborted') || message.includes('abort') ||
          event.reason?.name === 'AbortError') {
        event.preventDefault();
        return;
      }
      // Suppress canvas drawImage errors (non-fatal, occurs when layer not yet sized)
      if (message.includes('drawImage') || message.includes('width or height of 0')) {
        event.preventDefault();
        return;
      }
    };
    window.addEventListener('unhandledrejection', unhandledRejectionHandler);

    const startTracking = () => {
      if (positionInterval) return;
      positionInterval = setInterval(() => {
        if (recordingRef.current && mountedRef.current && !seekingRef.current) {
          const elapsed = Date.now() - playStartTimeRef.current;
          const interpolated = playStartPositionRef.current + elapsed;
          const dur = durationRef.current;
          const pos = dur > 0 ? Math.min(interpolated, dur) : interpolated;
          setPosition(pos);
          if (dur > 0 && pos >= dur - 100) {
            setState('ended');
          }
        }
      }, 100);
      positionIntervalRef.current = positionInterval;
    };

    const stopTracking = () => {
      if (positionInterval) {
        clearInterval(positionInterval);
        positionInterval = null;
        positionIntervalRef.current = null;
      }
    };

    const initRecording = () => {
      try {
        setState('loading');

        const guacDiv = document.createElement('div');
        guacDiv.style.display = 'flex';
        guacDiv.style.alignItems = 'center';
        guacDiv.style.justifyContent = 'center';
        guacDiv.style.width = '100%';
        guacDiv.style.height = '100%';
        guacDiv.style.overflow = 'hidden';
        guacDisplayRef.current = guacDiv;
        displayContainerRef.current!.appendChild(guacDiv);

        const tunnel = new Guacamole.StaticHTTPTunnel(recordingUrl);
        recording = new Guacamole.SessionRecording(tunnel);
        recordingRef.current = recording;

        const display = recording.getDisplay();
        displayRef.current = display;
        const element = display.getElement();
        element.style.margin = 'auto';
        guacDiv.appendChild(element);

        // onload fires when the tunnel closes and the library has flushed
        // its internal instruction buffer into the recordingBlob. Until
        // this fires, replayFrame() reads from an incomplete blob and
        // silently renders nothing. Playback must be deferred until loaded.
        recording.onload = () => {
          if (mountedRef.current) {
            setLoaded(true);
          }
        };

        recording.onplay = () => {
          if (mountedRef.current) {
            // Only refresh the time baseline — playStartPositionRef is already
            // set correctly by onseek (after seek) or onpause (after pause).
            // Using getPosition() here would jump because the library has
            // already advanced to the first frame internally before firing onplay.
            playStartTimeRef.current = Date.now();
            setState('playing');
            startTracking();
          }
        };

        recording.onpause = () => {
          // Suppress pause state during seeks — the library internally pauses
          // before seeking and resumes after, which would cause UI flicker
          if (mountedRef.current && !seekingRef.current) {
            // Snapshot the current interpolated position so resume starts from
            // the right place (onplay only refreshes the time baseline).
            const elapsed = Date.now() - playStartTimeRef.current;
            const interpolated = playStartPositionRef.current + elapsed;
            const dur = durationRef.current;
            playStartPositionRef.current = dur > 0 ? Math.min(interpolated, dur) : interpolated;
            setState('paused');
            stopTracking();
          }
        };

        recording.onseek = (_pos: number) => {
          if (mountedRef.current) {
            // Only clear flags here. Position and baseline are always set by
            // the caller (handleSeek, handleProgressClick, handleSkip, or
            // handlePlayPause) BEFORE calling seek(). The library fires
            // onseek for every intermediate frame it replays during a seek,
            // so updating position here would overwrite the user's requested
            // target with intermediate frame timestamps.
            seekingRef.current = false;
            seekTargetRef.current = null;
          }
        };

        recording.onprogress = (dur: number) => {
          if (mountedRef.current) {
            // Use session duration from backend if available, otherwise use recording duration
            const finalDuration = sessionDuration || dur;
            setDuration(finalDuration);
            durationRef.current = finalDuration;
          }
        };

        recording.onerror = (message: string) => {
          // Ignore non-fatal canvas drawing errors (occurs when layer not yet sized)
          if (message.includes('drawImage') || message.includes('width or height of 0')) {
            return;
          }
          console.error('Recording error:', message);
          if (mountedRef.current) {
            setState('error');
            onError?.(message);
          }
        };

        // Responsive resize handler
        const resizeDisplay = () => {
          if (!displayContainerRef.current || !mountedRef.current || !displayRef.current) return;
          const containerWidth = displayContainerRef.current.clientWidth;
          const containerHeight = displayContainerRef.current.clientHeight;
          const displayWidth = displayRef.current.getWidth() || 1;
          const displayHeight = displayRef.current.getHeight() || 1;

          // Scale to fit within container while maintaining aspect ratio
          const scale = Math.min(
            containerWidth / displayWidth,
            containerHeight / displayHeight,
            1 // Don't scale up beyond original size
          );
          displayRef.current.scale(scale);
        };

        recording.connect();

        resizeObserver = new ResizeObserver(() => {
          setTimeout(resizeDisplay, 50);
        });
        resizeObserver.observe(displayContainerRef.current!);

        // Also resize when display dimensions change
        display.onresize = resizeDisplay;

        setTimeout(resizeDisplay, 100);

      } catch (error: any) {
        console.error('Failed to initialize recording:', error);
        if (mountedRef.current) {
          setState('error');
          onError?.(error.message || 'Failed to load recording');
        }
      }
    };

    initRecording();

    return () => {
      mountedRef.current = false;
      window.removeEventListener('unhandledrejection', unhandledRejectionHandler);
      stopTracking();
      if (hideControlsTimeoutRef.current) {
        clearTimeout(hideControlsTimeoutRef.current);
      }
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (recording) {
        try {
          recording.disconnect();
        } catch (e) {}
        recordingRef.current = null;
      }
      if (guacDisplayRef.current && guacDisplayRef.current.parentNode) {
        guacDisplayRef.current.parentNode.removeChild(guacDisplayRef.current);
        guacDisplayRef.current = null;
      }
      displayRef.current = null;
      initializedRef.current = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordingUrl]);

  const handlePlayPause = useCallback(() => {
    if (!recordingRef.current) return;
    if (state === 'playing') {
      recordingRef.current.pause();
    } else if (state === 'ended') {
      seekingRef.current = true;
      setPosition(0);
      playStartPositionRef.current = 0;
      playStartTimeRef.current = Date.now();
      recordingRef.current.seek(0, () => {
        seekingRef.current = false;
        recordingRef.current?.play();
      });
    } else if (state === 'loading' && loaded) {
      // First play: seek to frame 0 first so the display renders the
      // initial frame before play() sets its real-time baseline.
      // This prevents the freeze-at-0:00 and time-jump bugs.
      seekingRef.current = true;
      setPosition(0);
      playStartPositionRef.current = 0;
      playStartTimeRef.current = Date.now();
      recordingRef.current.seek(0, () => {
        seekingRef.current = false;
        recordingRef.current?.play();
      });
    } else {
      recordingRef.current.play();
    }
  }, [state, loaded]);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!recordingRef.current) return;
    const newPosition = parseInt(e.target.value, 10);
    seekTargetRef.current = newPosition;
    seekingRef.current = true;
    setPosition(newPosition);
    playStartPositionRef.current = newPosition;
    playStartTimeRef.current = Date.now();
    if (state === 'loading' && loaded) {
      recordingRef.current.seek(newPosition, () => {
        seekingRef.current = false;
        recordingRef.current?.play();
      });
    } else {
      recordingRef.current.seek(newPosition);
    }
  }, [state, loaded]);

  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!recordingRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const newPosition = Math.floor(percentage * duration);
    seekTargetRef.current = newPosition;
    seekingRef.current = true;
    setPosition(newPosition);
    playStartPositionRef.current = newPosition;
    playStartTimeRef.current = Date.now();
    if (state === 'loading' && loaded) {
      recordingRef.current.seek(newPosition, () => {
        seekingRef.current = false;
        recordingRef.current?.play();
      });
    } else {
      recordingRef.current.seek(newPosition);
    }
  }, [duration, state, loaded]);

  const handleSkip = useCallback((seconds: number) => {
    if (!recordingRef.current) return;
    const newPosition = Math.max(0, Math.min(duration, position + seconds * 1000));
    seekTargetRef.current = newPosition;
    seekingRef.current = true;
    setPosition(newPosition);
    playStartPositionRef.current = newPosition;
    playStartTimeRef.current = Date.now();
    recordingRef.current.seek(newPosition);
  }, [position, duration]);

  const handleSpeedChange = useCallback((speed: number) => {
    setPlaybackSpeed(speed);
    setShowSpeedMenu(false);
  }, []);

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

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault();
          handlePlayPause();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          handleSkip(-10);
          break;
        case 'ArrowRight':
          e.preventDefault();
          handleSkip(10);
          break;
        case 'f':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'Escape':
          if (isFullscreen) {
            document.exitFullscreen();
          } else {
            onClose?.();
          }
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePlayPause, handleSkip, toggleFullscreen, isFullscreen, onClose]);

  useEffect(() => {
    if (!showSpeedMenu) return;
    const handleClick = () => setShowSpeedMenu(false);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [showSpeedMenu]);

  const progressPercent = duration ? (position / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className={`relative bg-black ${isFullscreen ? 'fixed inset-0 z-50' : 'rounded-xl overflow-hidden shadow-2xl'}`}
      style={{ aspectRatio: isFullscreen ? undefined : '16/9', maxHeight: isFullscreen ? '100vh' : '70vh' }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Display Area */}
      <div
        ref={displayContainerRef}
        className="absolute inset-0 flex items-center justify-center overflow-hidden bg-black"
        onClick={state === 'playing' || state === 'paused' ? handlePlayPause : undefined}
        style={{ cursor: state === 'playing' || state === 'paused' ? 'pointer' : 'default' }}
      />

      {/* Loading State */}
      {state === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black z-10">
          <div className="text-center text-white">
            {!loaded ? (
              <>
                <div className="relative w-16 h-16 mx-auto mb-4">
                  <div className="absolute inset-0 rounded-full border-4 border-gray-700"></div>
                  <div className="absolute inset-0 rounded-full border-4 border-primary-500 border-t-transparent animate-spin"></div>
                </div>
                <p className="text-gray-400">Loading recording...</p>
              </>
            ) : (
              <button onClick={handlePlayPause} className="group flex flex-col items-center gap-3">
                <div className="w-20 h-20 rounded-full bg-primary-600 hover:bg-primary-500 flex items-center justify-center transition-all group-hover:scale-110">
                  <svg className="w-10 h-10 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
                <span className="text-white font-medium">Click to Play</span>
                <span className="text-gray-500 text-sm">Duration: {formatTime(duration)}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Error State */}
      {state === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black z-10">
          <div className="text-center text-white max-w-sm">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/10 flex items-center justify-center">
              <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <p className="text-red-400 font-medium mb-2">Failed to load recording</p>
            <p className="text-gray-500 text-sm mb-4">The recording file may be unavailable or corrupted.</p>
            <button onClick={onClose} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm font-medium transition-colors">
              Close
            </button>
          </div>
        </div>
      )}

      {/* Ended State Overlay */}
      {state === 'ended' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10">
          <button onClick={handlePlayPause} className="group flex flex-col items-center gap-3">
            <div className="w-20 h-20 rounded-full bg-primary-600 hover:bg-primary-500 flex items-center justify-center transition-all group-hover:scale-110">
              <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
              </svg>
            </div>
            <span className="text-white font-medium">Replay</span>
          </button>
        </div>
      )}

      {/* Center Play/Pause indicator (briefly shown on click) */}
      {(state === 'playing' || state === 'paused') && !showControls && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-16 h-16 rounded-full bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
            {state === 'paused' ? (
              <svg className="w-8 h-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            ) : (
              <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
            )}
          </div>
        </div>
      )}

      {/* Top Bar - Close button (YouTube style: fades in/out) */}
      <div className={`absolute top-0 left-0 right-0 p-4 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent transition-opacity duration-300 z-20 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
          <div>
            <span className="text-white font-medium text-sm">
              {sessionName || 'Session Recording'}
            </span>
            {sessionDate && (
              <span className="text-white/50 text-sm ml-2">
                {sessionDate}
              </span>
            )}
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            title="Close (Esc)"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Bottom Controls Bar (YouTube style: fades in/out) */}
      <div className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent pt-12 pb-4 px-4 transition-opacity duration-300 z-20 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        {/* Progress Bar */}
        <div
          className="group relative h-1 bg-white/30 rounded-full cursor-pointer mb-4 hover:h-1.5 transition-all"
          onClick={handleProgressClick}
        >
          <div
            className="absolute inset-y-0 left-0 bg-primary-500 rounded-full transition-all"
            style={{ width: `${progressPercent}%` }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-primary-500 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ left: `calc(${progressPercent}% - 6px)` }}
          />
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={position}
            onChange={handleSeek}
            onClick={e => e.stopPropagation()}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </div>

        {/* Control Buttons */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Play/Pause */}
            <button onClick={handlePlayPause} className="p-2 text-white hover:bg-white/10 rounded-lg transition-colors">
              {state === 'playing' ? (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>

            {/* Skip Back */}
            <button onClick={() => handleSkip(-10)} className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors" title="Skip back 10s">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
              </svg>
            </button>

            {/* Skip Forward */}
            <button onClick={() => handleSkip(10)} className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors" title="Skip forward 10s">
              <svg className="w-5 h-5 transform scale-x-[-1]" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
              </svg>
            </button>

            {/* Time */}
            <div className="text-white text-sm font-mono tabular-nums ml-2">
              <span>{formatTime(position)}</span>
              <span className="text-white/50 mx-1">/</span>
              <span className="text-white/70">{formatTime(duration)}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Playback Speed */}
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setShowSpeedMenu(!showSpeedMenu); }}
                className="px-2 py-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors text-sm font-medium"
              >
                {playbackSpeed}x
              </button>
              {showSpeedMenu && (
                <div className="absolute bottom-full right-0 mb-2 bg-gray-900/95 backdrop-blur-sm rounded-lg shadow-xl border border-white/10 py-1 min-w-[70px]">
                  {PLAYBACK_SPEEDS.map((speed) => (
                    <button
                      key={speed}
                      onClick={() => handleSpeedChange(speed)}
                      className={`w-full px-3 py-1.5 text-sm text-left hover:bg-white/10 transition-colors ${playbackSpeed === speed ? 'text-primary-400' : 'text-white/80'}`}
                    >
                      {speed}x
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Fullscreen */}
            <button onClick={toggleFullscreen} className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors" title="Fullscreen (F)">
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
      </div>
    </div>
  );
}
