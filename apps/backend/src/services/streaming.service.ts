import { Server as SocketIOServer, Socket } from 'socket.io';
import type { KeystrokeEvent } from '@smartaiaudit/shared';

// Instructions that define the screen state (excluding size - handled separately)
// IMPORTANT: 'blob' contains actual image data, 'end' completes image streams
const CACHEABLE_INSTRUCTIONS = ['rect', 'cfill', 'copy', 'cursor', 'png', 'img', 'blob', 'end', 'move'];

// Track display state per session
interface DisplayState {
  // Main display size (layer -1 or 0)
  mainLayerSize: { layer: string; width: number; height: number; raw: string } | null;
  // Other layer sizes
  layerSizes: Map<string, string>; // layer -> raw instruction
}

// Screenshot data for late-join viewers
interface ScreenshotData {
  image: string;      // Base64 encoded image (data URL)
  width: number;
  height: number;
  timestamp: number;
}

class StreamingService {
  private io: SocketIOServer | null = null;
  private viewerMap = new Map<string, Set<string>>(); // sessionId -> Set<socketId>

  // Track display state per session
  private displayStateMap = new Map<string, DisplayState>();

  // Cache for drawing instructions per session
  private instructionCache = new Map<string, string[]>(); // sessionId -> instructions[]
  private maxCacheSize = 2000; // Max drawing instructions to cache (increased for image data)

  // Screenshots for late-join viewers
  private screenshotMap = new Map<string, ScreenshotData>(); // sessionId -> latest screenshot

  initialize(io: SocketIOServer): void {
    this.io = io;
    this.setupHandlers();
    console.log('[Streaming] Service initialized');
  }

  private setupHandlers(): void {
    if (!this.io) return;

    this.io.on('connection', (socket) => {
      console.log(`[Streaming] Client connected: ${socket.id}`);

      // Auditor wants to watch a session
      socket.on('watch-session', (sessionId: string) => {
        if (!this.viewerMap.has(sessionId)) {
          this.viewerMap.set(sessionId, new Set());
        }
        this.viewerMap.get(sessionId)!.add(socket.id);
        socket.join(`session:${sessionId}`);

        console.log(`[Streaming] ${socket.id} watching session ${sessionId}`);
        console.log(`[Streaming] Total viewers for ${sessionId}: ${this.viewerMap.get(sessionId)!.size}`);

        // Send cached instructions to new viewer
        this.sendCachedInstructions(socket, sessionId);
      });

      // Auditor stops watching a session
      socket.on('unwatch-session', (sessionId: string) => {
        this.viewerMap.get(sessionId)?.delete(socket.id);
        socket.leave(`session:${sessionId}`);
        console.log(`[Streaming] ${socket.id} stopped watching ${sessionId}`);
      });

      // Disconnect
      socket.on('disconnect', () => {
        console.log(`[Streaming] Client disconnected: ${socket.id}`);

        // Remove from all viewer sets
        for (const [sessionId, viewers] of this.viewerMap) {
          viewers.delete(socket.id);
          if (viewers.size === 0) {
            this.viewerMap.delete(sessionId);
          }
        }
      });
    });
  }

  /**
   * Send cached instructions to a new viewer
   */
  private sendCachedInstructions(socket: Socket, sessionId: string): void {
    const displayState = this.displayStateMap.get(sessionId);
    const cached = this.instructionCache.get(sessionId);
    const screenshot = this.screenshotMap.get(sessionId);

    let sentCount = 0;

    // FIRST: Send screenshot if available (this is the key for late-join!)
    if (screenshot) {
      console.log(`[Streaming] Sending screenshot to late-joiner ${socket.id}: ${screenshot.width}x${screenshot.height}`);
      socket.emit('session-screenshot', {
        sessionId,
        image: screenshot.image,
        width: screenshot.width,
        height: screenshot.height,
        timestamp: screenshot.timestamp,
      });
      sentCount++;
    }

    // SECOND: Send the main display size (critical for proper rendering)
    if (displayState?.mainLayerSize) {
      console.log(`[Streaming] Sending main display size to ${socket.id}:`, displayState.mainLayerSize);
      socket.emit('guac-data', {
        sessionId,
        data: displayState.mainLayerSize.raw,
        timestamp: Date.now(),
        cached: true,
      });
      sentCount++;
    }

    // THIRD: Send other layer sizes
    if (displayState?.layerSizes) {
      for (const [layer, raw] of displayState.layerSizes) {
        socket.emit('guac-data', {
          sessionId,
          data: raw,
          timestamp: Date.now(),
          cached: true,
        });
        sentCount++;
      }
    }

    // FOURTH: Send cached drawing instructions (deltas since last screenshot)
    // Only send recent instructions if we have a screenshot (they're deltas)
    // If no screenshot, send all cached (may still result in partial view)
    if (cached && cached.length > 0) {
      // If we have a screenshot, only send instructions from after it
      const instructionsToSend = screenshot
        ? cached.slice(-100) // Only last 100 instructions as deltas
        : cached;

      for (const instruction of instructionsToSend) {
        socket.emit('guac-data', {
          sessionId,
          data: instruction,
          timestamp: Date.now(),
          cached: true,
        });
        sentCount++;
      }
    }

    // FINALLY: Send a synthetic sync so the Guacamole display flushes/renders
    // Without sync, cached drawing instructions are accumulated but never displayed
    if (sentCount > 0) {
      const syncTimestamp = Date.now();
      socket.emit('guac-data', {
        sessionId,
        data: `4.sync,${String(syncTimestamp).length}.${syncTimestamp};`,
        timestamp: syncTimestamp,
        cached: true,
      });
      sentCount++;
      console.log(`[Streaming] Sent ${sentCount} items to ${socket.id} (screenshot: ${!!screenshot}, display: ${displayState?.mainLayerSize?.width}x${displayState?.mainLayerSize?.height})`);
    } else {
      console.log(`[Streaming] No cached data for ${sessionId}`);
    }
  }

  /**
   * Parse a Guacamole instruction to extract opcode and args
   */
  private parseInstruction(data: string): { opcode: string; args: string[] } | null {
    // Guacamole format: <length>.<opcode>,<length>.<arg1>,<length>.<arg2>,...;
    // Example: "4.size,2.-1,4.1920,4.1080;"
    try {
      const match = data.match(/^\d+\.(\w+),(.*)$/);
      if (!match) return null;

      const opcode = match[1];
      const argsStr = match[2].replace(/;$/, '');

      // Parse args (each arg is <length>.<value>)
      const args: string[] = [];
      let remaining = argsStr;
      while (remaining.length > 0) {
        const argMatch = remaining.match(/^(\d+)\.([^,]*),?/);
        if (!argMatch) break;
        args.push(argMatch[2]);
        remaining = remaining.slice(argMatch[0].length);
      }

      return { opcode, args };
    } catch {
      return null;
    }
  }

  /**
   * Cache an instruction if it's important for screen state
   */
  private cacheInstruction(sessionId: string, data: string): void {
    const parsed = this.parseInstruction(data);
    if (!parsed) return;

    const { opcode, args } = parsed;

    // Handle size instructions specially - track display state
    if (opcode === 'size' && args.length >= 3) {
      const layer = args[0];
      const width = parseInt(args[1], 10);
      const height = parseInt(args[2], 10);

      if (!this.displayStateMap.has(sessionId)) {
        this.displayStateMap.set(sessionId, {
          mainLayerSize: null,
          layerSizes: new Map(),
        });
      }

      const displayState = this.displayStateMap.get(sessionId)!;

      // Layer -1 or 0 is typically the main display
      if (layer === '-1' || layer === '0') {
        // Only update if this is a real display size (not a tiny cursor)
        if (width > 100 && height > 100) {
          displayState.mainLayerSize = { layer, width, height, raw: data };
          console.log(`[Streaming] Captured main display size for ${sessionId}: ${width}x${height}`);
        }
      } else if (width > 0 && height > 0) {
        // Other layers (cursors, overlays) - store by layer ID
        displayState.layerSizes.set(layer, data);
      }
      return; // Don't add size to regular cache
    }

    // Check if instruction should be cached in drawing cache
    const shouldCache = CACHEABLE_INSTRUCTIONS.some(op => opcode === op);
    if (!shouldCache) return;

    if (!this.instructionCache.has(sessionId)) {
      this.instructionCache.set(sessionId, []);
    }

    const cache = this.instructionCache.get(sessionId)!;

    // Add to cache
    cache.push(data);

    // Limit cache size
    if (cache.length > this.maxCacheSize) {
      cache.shift(); // Remove oldest
    }
  }

  /**
   * Broadcast Guacamole protocol message to all viewers
   */
  broadcastGuacData(sessionId: string, data: string): void {
    // Cache important instructions
    this.cacheInstruction(sessionId, data);

    // Emit to the session room
    this.io?.to(`session:${sessionId}`).emit('guac-data', {
      sessionId,
      data,
      timestamp: Date.now(),
    });
  }

  /**
   * Clear instruction cache for a session
   */
  clearCache(sessionId: string): void {
    this.instructionCache.delete(sessionId);
    this.displayStateMap.delete(sessionId);
    this.screenshotMap.delete(sessionId);
  }

  /**
   * Store screenshot from client for late-join viewers
   */
  storeScreenshot(sessionId: string, data: ScreenshotData): void {
    this.screenshotMap.set(sessionId, data);

    // Clear old cached instructions since we have a fresh screenshot
    // Keep only recent instructions as "deltas" since the screenshot
    const cached = this.instructionCache.get(sessionId);
    if (cached && cached.length > 100) {
      // Keep only last 100 instructions
      this.instructionCache.set(sessionId, cached.slice(-100));
    }

    console.log(`[Streaming] Screenshot stored for ${sessionId}: ${data.width}x${data.height}`);
  }

  /**
   * Get screenshot for a session
   */
  getScreenshot(sessionId: string): ScreenshotData | null {
    return this.screenshotMap.get(sessionId) || null;
  }

  /**
   * Broadcast keystroke event to all viewers
   */
  broadcastKeystroke(sessionId: string, keystroke: KeystrokeEvent): void {
    const viewers = this.viewerMap.get(sessionId);
    if (!viewers || viewers.size === 0) return;

    this.io?.to(`session:${sessionId}`).emit('keystroke', {
      sessionId,
      keystroke,
      timestamp: Date.now(),
    });
  }

  /**
   * Broadcast session status update
   */
  broadcastSessionUpdate(
    sessionId: string,
    update: Record<string, any>
  ): void {
    this.io?.emit('session-update', {
      sessionId,
      ...update,
      timestamp: Date.now(),
    });
  }

  /**
   * Notify all auditors of a new session
   */
  notifySessionStart(sessionId: string, sessionData: any): void {
    this.io?.emit('session-started', {
      sessionId,
      session: sessionData,
      timestamp: Date.now(),
    });
  }

  /**
   * Notify all auditors of a session end
   */
  notifySessionEnd(sessionId: string): void {
    this.io?.to(`session:${sessionId}`).emit('session-ended', {
      sessionId,
      timestamp: Date.now(),
    });

    // Clean up
    this.viewerMap.delete(sessionId);
    this.instructionCache.delete(sessionId);
    this.displayStateMap.delete(sessionId);
    this.screenshotMap.delete(sessionId);
  }

  /**
   * Get viewer count for a session
   */
  getViewerCount(sessionId: string): number {
    return this.viewerMap.get(sessionId)?.size || 0;
  }

  /**
   * Get all active viewers
   */
  getAllViewers(): Map<string, Set<string>> {
    return this.viewerMap;
  }

  /**
   * Add a viewer to a session
   */
  addViewer(sessionId: string, socketId: string): void {
    if (!this.viewerMap.has(sessionId)) {
      this.viewerMap.set(sessionId, new Set());
    }
    this.viewerMap.get(sessionId)!.add(socketId);
  }

  /**
   * Remove a viewer from a session
   */
  removeViewer(sessionId: string, socketId: string): void {
    this.viewerMap.get(sessionId)?.delete(socketId);
    if (this.viewerMap.get(sessionId)?.size === 0) {
      this.viewerMap.delete(sessionId);
    }
  }

  /**
   * Remove a viewer from all sessions
   */
  removeViewerFromAll(socketId: string): void {
    for (const [sessionId, viewers] of this.viewerMap) {
      viewers.delete(socketId);
      if (viewers.size === 0) {
        this.viewerMap.delete(sessionId);
      }
    }
  }

  /**
   * Broadcast risk alert to all auditors
   * Note: We only emit globally (not also to session room) to avoid duplicate alerts
   * for auditors who are watching the specific session
   */
  broadcastRiskAlert(sessionId: string, alerts: any[]): void {
    // Broadcast globally to all connected auditors
    this.io?.emit('risk-alert', {
      sessionId,
      alerts,
      timestamp: Date.now(),
    });
  }
}

// Export singleton
export const streamingService = new StreamingService();
