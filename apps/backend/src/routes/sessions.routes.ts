import { Router, Request, Response } from 'express';
import { supabase } from '../config/supabase.js';
import { sessionService } from '../services/session.service.js';
import { recordingService } from '../services/recording.service.js';
import { llmService } from '../services/llm.service.js';
import { streamingService } from '../services/streaming.service.js';
import { authService } from '../services/auth.service.js';
import { riskAggregationService } from '../services/risk-aggregation.service.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { auditService } from '../services/audit.service.js';

const router = Router();

/**
 * List all sessions
 * Query params:
 * - status: filter by status (active, disconnected, etc.)
 * - riskLevel: filter by risk level (comma-separated for multiple)
 * - reviewed: filter by review status (true/false)
 * - tags: filter by tags (comma-separated)
 * - flag: filter by behavioral flag (privilege_escalation, data_exfiltration, persistence, lateral_movement, credential_access, defense_evasion)
 * - search: search in server name, host, user name, or tags
 * - limit: number of results (default 50)
 * - offset: pagination offset
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { status, riskLevel, reviewed, tags, flag, search, limit = 50, offset = 0, clientUserId } = req.query;

    let query = supabase
      .from('sessions')
      .select('*, servers(id, name, host, port, protocol, enabled), user:users!user_id(id, email, username, display_name)', { count: 'exact' })
      .order('started_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (status) {
      query = query.eq('status', status);
    }

    if (clientUserId) {
      query = query.eq('client_user_id', clientUserId);
    }

    if (riskLevel) {
      // Support comma-separated risk levels
      const levels = (riskLevel as string).split(',').map((l) => l.trim());
      query = query.in('risk_level', levels);
    }

    if (reviewed !== undefined && reviewed !== '') {
      query = query.eq('reviewed', reviewed === 'true');
    }

    if (tags) {
      // Filter sessions that contain ANY of the specified tags
      const tagList = (tags as string).split(',').map((t) => t.trim().toLowerCase());
      query = query.overlaps('tags', tagList);
    }

    // Filter by behavioral flag (MITRE ATT&CK pattern)
    if (flag) {
      const validFlags = ['privilege_escalation', 'data_exfiltration', 'persistence', 'lateral_movement', 'credential_access', 'defense_evasion'];
      const flagName = (flag as string).toLowerCase();
      if (validFlags.includes(flagName)) {
        query = query.eq(flagName, true);
      }
    }

    // Note: search is handled separately via session service for complex queries
    // For simple server-side filtering, we can search in server name
    if (search) {
      // Use text search on related server fields
      // This requires a join, so we'll filter in application layer for now
    }

    const { data: sessions, count, error } = await query;

    if (error) {
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }

    // If search is provided, filter results in application layer
    // Searches: server name, server host, user display_name, user username, tags
    let filteredSessions = sessions || [];
    if (search) {
      const searchLower = (search as string).toLowerCase();
      filteredSessions = filteredSessions.filter((s: any) =>
        s.servers?.name?.toLowerCase().includes(searchLower) ||
        s.servers?.host?.toLowerCase().includes(searchLower) ||
        s.user?.display_name?.toLowerCase().includes(searchLower) ||
        s.user?.username?.toLowerCase().includes(searchLower) ||
        (Array.isArray(s.tags) && s.tags.some((tag: string) => tag.toLowerCase().includes(searchLower)))
      );
    }

    res.json({
      success: true,
      data: filteredSessions,
      pagination: {
        limit: Number(limit),
        offset: Number(offset),
        total: search ? filteredSessions.length : (count || 0),
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Get active sessions only
 */
router.get('/active', async (req: Request, res: Response) => {
  try {
    const { data: sessions, error } = await supabase
      .from('sessions')
      .select('*, servers(id, name, host, protocol, enabled), user:users!user_id(id, email, username, display_name)')
      .eq('status', 'active')
      .order('started_at', { ascending: false });

    if (error) {
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }

    res.json({
      success: true,
      data: sessions,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// =============================================================================
// RISK ANALYTICS ROUTES (must be before /:id to avoid route conflicts)
// =============================================================================

/**
 * Get overall risk statistics
 */
router.get('/risk/stats', authMiddleware, async (req: Request, res: Response) => {
  try {
    const stats = await riskAggregationService.getOverallRiskStats();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Get high risk users
 */
router.get('/risk/users', authMiddleware, async (req: Request, res: Response) => {
  try {
    const limit = Number(req.query.limit) || 10;
    const users = await riskAggregationService.getHighRiskUsers(limit);

    res.json({
      success: true,
      data: users,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Get high risk servers
 */
router.get('/risk/servers', authMiddleware, async (req: Request, res: Response) => {
  try {
    const limit = Number(req.query.limit) || 10;
    const servers = await riskAggregationService.getHighRiskServers(limit);

    res.json({
      success: true,
      data: servers,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Get behavioral pattern summary
 */
router.get('/risk/behavioral', authMiddleware, async (req: Request, res: Response) => {
  try {
    const summary = await riskAggregationService.getBehavioralPatternSummary();

    res.json({
      success: true,
      data: summary,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Get risk profile for a specific user
 */
router.get('/risk/users/:userId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const profile = await riskAggregationService.getUserRiskProfile(userId);

    if (!profile) {
      return res.status(404).json({
        success: false,
        error: 'User risk profile not found',
      });
    }

    res.json({
      success: true,
      data: profile,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Get risk trend for a user
 */
router.get('/risk/users/:userId/trend', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const days = Number(req.query.days) || 30;
    const trend = await riskAggregationService.getUserRiskTrend(userId, days);

    res.json({
      success: true,
      data: trend,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Get risk profile for a specific server
 */
router.get('/risk/servers/:serverId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;
    const profile = await riskAggregationService.getServerRiskProfile(serverId);

    if (!profile) {
      return res.status(404).json({
        success: false,
        error: 'Server risk profile not found',
      });
    }

    res.json({
      success: true,
      data: profile,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Get session by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { data: session, error } = await supabase
      .from('sessions')
      .select('*, servers(*), user:users!user_id(id, email, username, display_name), reviewer:users!reviewed_by(id, email, username, display_name)')
      .eq('id', id)
      .single();

    if (error) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
      });
    }

    res.json({
      success: true,
      data: session,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Create new session
 * Body: { serverId, clientUserId }
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { serverId, clientUserId } = req.body;

    if (!serverId || !clientUserId) {
      return res.status(400).json({
        success: false,
        error: 'serverId and clientUserId are required',
      });
    }

    // Verify server exists
    const { data: server, error: serverError } = await supabase
      .from('servers')
      .select('*')
      .eq('id', serverId)
      .single();

    if (serverError || !server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found',
      });
    }

    // Create session
    const newSession = await sessionService.createSession({
      server_id: serverId,
      client_user_id: clientUserId,
    });

    if (!newSession) {
      return res.status(500).json({
        success: false,
        error: 'Failed to create session',
      });
    }

    // Initialize recording
    recordingService.initRecording(newSession.id);

    const { data: session, error } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', newSession.id)
      .single();

    if (error) {
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }

    res.status(201).json({
      success: true,
      data: session,
      message: 'Session created successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * End session
 */
router.post('/:id/end', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // End session - this handles:
    // 1. Capturing keystrokes from memory
    // 2. Saving recording to DB and storage
    // 3. Running AI analysis with captured keystrokes
    // 4. Cleanup
    await sessionService.endSession(id);

    const { data: session, error } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
      });
    }

    res.json({
      success: true,
      data: session,
      message: 'Session ended successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Get recording download URL
 * Generates signed URL for .guac file download
 */
router.get('/:id/recording-url', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const expiresIn = Number(req.query.expiresIn) || 3600; // Default 1 hour

    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('guac_recording_url')
      .eq('id', id)
      .single();

    if (sessionError || !session?.guac_recording_url) {
      return res.status(404).json({
        success: false,
        error: 'Recording not found',
      });
    }

    // Generate signed URL
    const { data, error } = await supabase.storage
      .from('session-recordings')
      .createSignedUrl(session.guac_recording_url, expiresIn);

    if (error) {
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }

    res.json({
      success: true,
      data: {
        signedUrl: data.signedUrl,
        expiresIn,
        expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Get latest screenshot for a session (used by auditor live monitor on session switch)
 */
router.get('/:id/screenshot', async (req: Request, res: Response) => {
  try {
    const { id: sessionId } = req.params;
    const screenshot = streamingService.getScreenshot(sessionId);

    if (!screenshot) {
      return res.status(404).json({ success: false, error: 'No screenshot available' });
    }

    res.json({ success: true, data: { sessionId, ...screenshot } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Receive screenshot from client for late-join viewers
 * Body: { image: string (base64), width: number, height: number, timestamp: number }
 */
router.post('/:id/screenshot', async (req: Request, res: Response) => {
  try {
    const { id: sessionId } = req.params;
    const { image, width, height, timestamp } = req.body;

    if (!image) {
      return res.status(400).json({
        success: false,
        error: 'image is required',
      });
    }

    // Store screenshot in streaming service
    streamingService.storeScreenshot(sessionId, {
      image,
      width: width || 0,
      height: height || 0,
      timestamp: timestamp || Date.now(),
    });

    res.json({
      success: true,
      message: 'Screenshot received',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Get session statistics
 */
router.get('/stats/overview', async (req: Request, res: Response) => {
  try {
    const { data: stats, error } = await supabase
      .from('session_statistics')
      .select('*')
      .single();

    if (error) {
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }

    res.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Mark session as reviewed
 * Body: { reviewed: boolean, notes?: string }
 */
router.patch('/:id/review', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reviewed, notes } = req.body;

    // Get user ID from JWT token
    let userId: string | undefined;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const payload = authService.verifyToken(token);
      userId = payload?.userId;
    }

    if (reviewed === true) {
      const result = await sessionService.markSessionReviewed(id, userId!, notes);
      if (!result.success) {
        return res.status(500).json({
          success: false,
          error: result.error,
        });
      }
    } else {
      const result = await sessionService.markSessionUnreviewed(id);
      if (!result.success) {
        return res.status(500).json({
          success: false,
          error: result.error,
        });
      }
    }

    // Fetch updated session with reviewer info
    const { data: session, error } = await supabase
      .from('sessions')
      .select('*, servers(id, name, host, protocol), user:users!user_id(id, email, username, display_name), reviewer:users!reviewed_by(id, email, username, display_name)')
      .eq('id', id)
      .single();

    if (error) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
      });
    }

    // Get reviewer info for audit log (use username as it cannot be changed)
    let reviewerName: string | undefined;
    if (userId) {
      const { data: reviewer } = await supabase
        .from('users')
        .select('username')
        .eq('id', userId)
        .single();
      reviewerName = reviewer?.username;
    }

    // Audit log: session reviewed/unreviewed (with reviewer name)
    await auditService.log({
      actorId: userId,
      actorName: reviewerName,
      action: reviewed ? 'session_reviewed' : 'session_unreviewed',
      resourceType: 'session',
      resourceId: id,
      resourceName: session?.servers?.name,
      ipAddress: auditService.getIpFromRequest(req),
    });

    res.json({
      success: true,
      data: session,
      message: reviewed ? 'Session marked as reviewed' : 'Session marked as unreviewed',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Add tag to session
 * Body: { tag: string }
 */
router.post('/:id/tags', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { tag } = req.body;

    if (!tag || typeof tag !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Tag is required and must be a string',
      });
    }

    const result = await sessionService.addTag(id, tag);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error,
      });
    }

    // Audit log: tag added
    await auditService.logTagAction(req, 'tag_added', id, tag);

    res.json({
      success: true,
      data: { tags: result.tags },
      message: 'Tag added successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Remove tag from session
 */
router.delete('/:id/tags/:tagName', async (req: Request, res: Response) => {
  try {
    const { id, tagName } = req.params;

    const result = await sessionService.removeTag(id, tagName);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error,
      });
    }

    // Audit log: tag removed
    await auditService.logTagAction(req, 'tag_removed', id, tagName);

    res.json({
      success: true,
      data: { tags: result.tags },
      message: 'Tag removed successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
