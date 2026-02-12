import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import GuacamoleLite from 'guacamole-lite';
import { env, validateEnvOnStartup } from './config/env.js';
import { testSupabaseConnection } from './config/supabase.js';
import { getGuacamoleLiteConfig } from './config/guacamole.js';
import { logger } from './utils/logger.js';

// Middleware
import { corsMiddleware } from './middleware/cors.js';
import { requestLogger } from './middleware/logger.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';

// Routes
import healthRoutes from './routes/health.routes.js';
import sessionsRoutes from './routes/sessions.routes.js';
import videoExportsRoutes from './routes/video-exports.routes.js';
import storageRoutes from './routes/storage.routes.js';
import connectionsRoutes from './routes/connections.routes.js';
import adminRoutes from './routes/admin.routes.js';
import setupRoutes from './routes/setup.routes.js';
import authRoutes from './routes/auth.routes.js';
import usersRoutes from './routes/users.routes.js';
import groupsRoutes from './routes/groups.routes.js';
import bansRoutes from './routes/bans.routes.js';

// Services
import { recordingService } from './services/recording.service.js';
import { streamingService } from './services/streaming.service.js';
import { sessionService } from './services/session.service.js';
import { riskDetectionService } from './services/risk-detection.service.js';

// Validate environment
validateEnvOnStartup((msg) => logger.info(msg));

// Initialize Express
const app = express();

// ============================================================================
// Middleware
// ============================================================================
app.use(corsMiddleware);
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

// ============================================================================
// API Routes
// ============================================================================
app.use('/', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/groups', groupsRoutes);
app.use('/api/sessions', sessionsRoutes);
app.use('/api/video-exports', videoExportsRoutes);
app.use('/api/storage', storageRoutes);
app.use('/api/connections', connectionsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/setup', setupRoutes);
app.use('/api/bans', bansRoutes);

// ============================================================================
// Error Handling
// ============================================================================
app.use(notFoundHandler);
app.use(errorHandler);

// ============================================================================
// HTTP Server + Socket.IO
// ============================================================================
const httpServer = createServer(app);

// Create Socket.IO attached to HTTP server
const io = new SocketIOServer(httpServer, {
  path: '/socket.io/',
  cors: {
    origin: (origin, callback) => {
      // Allow Electron apps (no origin or file://)
      if (!origin || origin.startsWith('file://')) {
        return callback(null, true);
      }
      // Allow localhost
      if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
        return callback(null, true);
      }
      // Check whitelist
      const whitelist = env.CORS_ORIGIN.split(',');
      if (whitelist.includes(origin)) {
        return callback(null, true);
      }
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  },
  // Use polling only to avoid WebSocket conflict with guacamole-lite
  transports: ['polling'],
  allowUpgrades: false,
});

// Initialize streaming service with Socket.IO
streamingService.initialize(io);

// Socket.IO connection handler
io.on('connection', (socket) => {
  logger.debug(`[Socket.IO] Client connected: ${socket.id}`);

  socket.on('watch-session', (sessionId: string) => {
    logger.debug(`[Socket.IO] ${socket.id} watching session: ${sessionId}`);
    streamingService.addViewer(sessionId, socket.id);
    socket.join(`session:${sessionId}`);
  });

  socket.on('unwatch-session', (sessionId: string) => {
    logger.debug(`[Socket.IO] ${socket.id} stopped watching: ${sessionId}`);
    streamingService.removeViewer(sessionId, socket.id);
    socket.leave(`session:${sessionId}`);
  });

  socket.on('terminate-session', async (sessionId: string) => {
    logger.info(`[Socket.IO] Terminate request for session ${sessionId} from ${socket.id}`);

    const connectionId = sessionService.getConnectionIdBySession(sessionId);

    if (connectionId) {
      logger.info(`[Socket.IO] Ending session ${sessionId} before closing connection`);
      await sessionService.endSession(sessionId);

      let connectionClosed = false;
      guacServer.activeConnections.forEach((conn: any, connId: string) => {
        if (String(connId) === connectionId || String(conn.connectionId) === connectionId) {
          try {
            if (typeof conn.close === 'function') {
              conn.close();
              connectionClosed = true;
            } else if (conn.webSocket) {
              conn.webSocket.close(1000, 'Session terminated by auditor');
              connectionClosed = true;
            }
          } catch (e) {
            logger.error(`[Socket.IO] Error closing connection: ${e}`);
          }
        }
      });

      if (!connectionClosed) {
        logger.warn(`[Socket.IO] Could not find active connection to close for session ${sessionId}`);
      }
    } else {
      logger.warn(`[Socket.IO] No connectionId found for session ${sessionId}`);
      await sessionService.endSession(sessionId);
    }

    // Broadcast termination to all watchers
    io.to(`session:${sessionId}`).emit('session-terminated', { sessionId });
  });

  socket.on('disconnect', () => {
    logger.debug(`[Socket.IO] Client disconnected: ${socket.id}`);
    streamingService.removeViewerFromAll(socket.id);
  });
});

// ============================================================================
// Guacamole-Lite Setup
// ============================================================================
const guacConfig = getGuacamoleLiteConfig();

logger.info(`[Guacamole] Initializing — guacd=${env.GUACD_HOST}:${env.GUACD_PORT}, path=/ws`);

// Create guacamole server - it will attach to httpServer on /ws path only
const guacServer = new GuacamoleLite(
  {
    server: httpServer,
    path: '/ws',
  },
  guacConfig.guacd,
  guacConfig.client
);

// ============================================================================
// Guacamole Event Handlers
// ============================================================================

guacServer.on('open', (clientConnection: any) => {
  const connectionId = String(clientConnection.connectionId);

  // Extract sessionId from decrypted connection settings
  // The sessionId is at the root level of the token we encrypted
  const sessionId =
    clientConnection.connectionSettings?.sessionId ||
    clientConnection.externalSessionId;

  logger.info(`[Guacamole] Connection opened: connectionId=${connectionId}, sessionId=${sessionId || 'unknown'}`);

  if (sessionId) {
    // Store sessionId on the connection for later access
    clientConnection.externalSessionId = sessionId;

    // Register connection mapping
    sessionService.registerConnection(sessionId, connectionId);

    // Map the WebSocket to sessionId for keystroke tracking
    registerWebSocketSession(connectionId, sessionId);

    // Update session status to active
    sessionService.updateSessionStatus(sessionId, 'active').catch((e) => logger.error(`[Guacamole] ${e}`));

    // Initialize recording if not exists
    if (!recordingService.getStats(sessionId)) {
      recordingService.initRecording(sessionId);
    }

    // Notify auditors that session started
    streamingService.broadcastSessionUpdate(sessionId, {
      status: 'active',
      connectionId,
      timestamp: Date.now(),
    });
  } else {
    logger.warn(`[Guacamole] No sessionId on connection ${connectionId}`);
  }
});

guacServer.on('close', async (clientConnection: any) => {
  const connectionId = String(clientConnection.connectionId);
  const sessionId = sessionService.getSessionIdByConnection(connectionId);

  logger.info(`[Guacamole] Connection closed: connectionId=${connectionId}, sessionId=${sessionId || 'unknown'}`);

  if (sessionId) {
    // End session (handles recording, analysis, and cleanup)
    await sessionService.endSession(sessionId);

    // Notify auditors that session ended
    streamingService.broadcastSessionUpdate(sessionId, {
      status: 'disconnected',
      timestamp: Date.now(),
    });
  }
});

guacServer.on('error', (clientConnection: any, error: Error) => {
  logger.error(`[Guacamole] Connection error: ${error?.message || error}`);

  const connectionId = clientConnection?.connectionId
    ? String(clientConnection.connectionId)
    : null;

  if (connectionId) {
    const sessionId = sessionService.getSessionIdByConnection(connectionId);
    if (sessionId) {
      sessionService
        .updateSessionStatus(sessionId, 'error', error?.message || 'Unknown error')
        .catch((e) => logger.error(`[Guacamole] ${e}`));

      streamingService.broadcastSessionUpdate(sessionId, {
        status: 'error',
        error: error?.message || 'Unknown error',
        timestamp: Date.now(),
      });
    }
  }
});

// Handle WebSocket server errors
guacServer.webSocketServer.on('error', (error: Error) => {
  logger.error(`[Guacamole WS] Error: ${error?.message || error}`);
});

// ============================================================================
// WebSocket Message Interception for Keystroke Tracking
// ============================================================================
// Note: guacamole-lite doesn't emit a 'clientData' event, so we intercept
// WebSocket messages directly from the underlying WebSocket server.

// Map to track WebSocket to sessionId mapping
const wsSessionMap = new Map<any, string>();
// Map to track last processed keystroke position for risk detection (to avoid duplicates)
const lastProcessedKeystrokePos = new Map<string, number>();

// Intercept WebSocket connections to track messages
guacServer.webSocketServer.on('connection', (ws: any, req: any) => {
  logger.debug(`[WebSocket] New connection from ${req.socket.remoteAddress}`);

  // Intercept outgoing messages (server -> client = screen data for auditors)
  const originalSend = ws.send.bind(ws);
  ws.send = (data: any, ...args: any[]) => {
    const sessionId = wsSessionMap.get(ws);

    if (sessionId && typeof data === 'string') {
      // Broadcast ALL screen data to auditors watching this session
      streamingService.broadcastGuacData(sessionId, data);
    }

    // Call original send
    return originalSend(data, ...args);
  };

  // Listen for messages from the client (keystrokes, mouse events)
  ws.on('message', (rawData: Buffer | string) => {
    const data = rawData.toString();

    // Try to get sessionId from our map
    const sessionId = wsSessionMap.get(ws);

    if (sessionId) {
      // Extract and record keystrokes
      if (data.includes('.key,')) {
        const keysAdded = recordingService.addKeystrokesFromMessage(sessionId, data);
        if (keysAdded > 0) {
          const stats = recordingService.getStats(sessionId);

          // Add ONLY NEW keystrokes to risk detection buffer (to avoid duplicates)
          const keystrokes = stats?.keystrokes || '';
          if (keystrokes) {
            const lastPos = lastProcessedKeystrokePos.get(sessionId) || 0;
            const newChars = keystrokes.slice(lastPos);

            if (newChars.length > 0) {
              // Update processed position
              lastProcessedKeystrokePos.set(sessionId, keystrokes.length);

              // Add only the new characters to risk detection
              riskDetectionService.addKeystrokes(sessionId, newChars);

              // Check for risks and broadcast alerts (only new alerts are returned)
              riskDetectionService.checkAndAlertRisks(sessionId).then(alerts => {
                if (alerts.length > 0) {
                  const highPriorityAlerts = alerts.filter(a => ['critical', 'high'].includes(a.level));
                  if (highPriorityAlerts.length > 0) {
                    logger.info(`[RiskDetection] ${highPriorityAlerts.length} high-priority alerts for session ${sessionId}`);
                    streamingService.broadcastRiskAlert(sessionId, highPriorityAlerts);

                    // Broadcast updated risk level to all viewers
                    const riskLevel = riskDetectionService.getSessionRiskLevel(sessionId);
                    streamingService.broadcastSessionUpdate(sessionId, { riskLevel });
                  }
                }
              }).catch(err => logger.error(`[RiskDetection] Error: ${err}`));
            }
          }

          // Broadcast keystroke count update to auditors
          if (stats) {
            streamingService.broadcastSessionUpdate(sessionId, {
              keystrokeCount: stats.keystrokeCount,
            });
          }
        }
      }
    }
  });

  ws.on('close', () => {
    const sessionId = wsSessionMap.get(ws);
    if (sessionId) {
      lastProcessedKeystrokePos.delete(sessionId);
    }
    wsSessionMap.delete(ws);
  });
});

// Helper function to associate WebSocket with sessionId (called from 'open' event)
function registerWebSocketSession(connectionId: string, sessionId: string): void {
  // Find the WebSocket for this connection
  guacServer.activeConnections.forEach((conn: any) => {
    if (String(conn.connectionId) === connectionId && conn.webSocket) {
      wsSessionMap.set(conn.webSocket, sessionId);
      logger.debug(`[WebSocket] Mapped connection ${connectionId} to session ${sessionId}`);
    }
  });
}

// ============================================================================
// Background Jobs
// ============================================================================

// Periodic cleanup of old in-memory recordings (every hour)
setInterval(() => {
  const cleaned = recordingService.cleanupOldRecordings();
  if (cleaned > 0) {
    logger.info(`[Cleanup] Removed ${cleaned} old in-memory recording(s)`);
  }
}, 60 * 60 * 1000);

// Periodic save of keystroke counts to database (every 30 seconds)
// This ensures keystroke counts persist across page refreshes during active sessions
setInterval(async () => {
  const activeSessionIds = Array.from(wsSessionMap.values());
  const uniqueSessionIds = [...new Set(activeSessionIds)];

  for (const sessionId of uniqueSessionIds) {
    try {
      await recordingService.updateKeystrokeCount(sessionId);
    } catch (error) {
      logger.error(`[Keystroke] Failed to persist count for session ${sessionId}: ${error}`);
    }
  }

  if (uniqueSessionIds.length > 0) {
    logger.debug(`[Keystroke] Persisted counts for ${uniqueSessionIds.length} active session(s)`);
  }
}, 30 * 1000);

// Periodic cleanup of stale sessions (every 2 minutes)
// Catches sessions stuck in connecting/active after client crash
setInterval(async () => {
  try {
    await sessionService.cleanupStaleSessions();
  } catch (error) {
    logger.error(`[Cleanup] Failed to clean stale sessions: ${error}`);
  }
}, 2 * 60 * 1000);

// TODO: Add video export cleanup job (every hour)
// TODO: Add storage monitoring job (every 6 hours)

// ============================================================================
// Server Startup
// ============================================================================

async function startServer() {
  try {
    // Test Supabase connection
    logger.info('[Startup] Testing Supabase connection...');
    const supabaseReady = await testSupabaseConnection();

    if (!supabaseReady) {
      logger.error('Cannot start server: Supabase connection failed');
      logger.error('Check your SUPABASE_PROJECT_URL and SUPABASE_SECRET_KEY');
      process.exit(1);
    }

    logger.info('[Startup] Supabase connection successful');

    // Clean up any stale sessions from previous runs / client crashes
    const staleCleaned = await sessionService.cleanupStaleSessions(0);
    if (staleCleaned > 0) {
      logger.info(`[Startup] Cleaned ${staleCleaned} stale session(s) from previous run`);
    }

    // Start HTTP server
    httpServer.listen(env.PORT, '0.0.0.0', () => {
      logger.info(`SmartAudit Backend running — env=${env.NODE_ENV} port=${env.PORT} guacd=${env.GUACD_HOST}:${env.GUACD_PORT}`);
    });
  } catch (error) {
    logger.error(`Failed to start server: ${error}`);
    process.exit(1);
  }
}

// ============================================================================
// Graceful Shutdown
// ============================================================================

function gracefulShutdown(signal: string) {
  logger.info(`Received ${signal}, shutting down gracefully...`);

  // Stop accepting new connections
  httpServer.close(() => {
    logger.info('HTTP server closed');

    // Close all Socket.IO connections
    io.close(() => {
      logger.info('Socket.IO closed');
      process.exit(0);
    });
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Unhandled errors
process.on('unhandledRejection', (reason, promise) => {
  logger.error(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
});

process.on('uncaughtException', (error) => {
  logger.error(`Uncaught Exception: ${error}`);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

// Start the server
startServer();
