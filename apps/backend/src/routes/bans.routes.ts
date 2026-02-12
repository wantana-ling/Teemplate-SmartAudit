import { Router, Request, Response } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth.middleware.js';
import { banService } from '../services/ban.service.js';
import { auditService } from '../services/audit.service.js';
import { supabase } from '../config/supabase.js';

interface CreateBanRequest {
  userId: string;
  reason: string;
  duration?: '1h' | '24h' | '7d' | '30d' | 'permanent';
  sessionId?: string;
}

interface FreezeRequest {
  userId: string;
  serverId: string;
  reason: string;
  sessionId?: string;
}

const router = Router();

/**
 * Create a new ban
 * POST /api/bans
 */
router.post('/', authMiddleware, requireRole(['super_admin', 'admin', 'auditor']), async (req: Request, res: Response) => {
  try {
    const { userId, reason, duration, sessionId } = req.body as CreateBanRequest;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required',
      });
    }

    if (!reason || reason.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'reason is required',
      });
    }

    // Prevent banning yourself
    if (userId === req.user?.userId) {
      return res.status(400).json({
        success: false,
        error: 'You cannot ban yourself',
      });
    }

    // Prevent banning super_admin users
    const { data: targetUser } = await supabase.from('users').select('role').eq('id', userId).single();
    if (targetUser?.role === 'super_admin') {
      return res.status(403).json({
        success: false,
        error: 'Cannot ban a super admin user',
      });
    }

    const result = await banService.banUser({
      userId,
      bannedBy: req.user!.userId,
      reason: reason.trim(),
      duration,
      sessionId,
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
      });
    }

    // Get user info for audit log
    const { data: user } = await supabase.from('users').select('display_name, username, email').eq('id', userId).single();
    const userName = user?.display_name || user?.username || user?.email?.split('@')[0];

    // Audit log: user banned
    await auditService.logBan(req, 'user_banned', result.ban!.id, userId, userName, reason, duration);

    res.json({
      success: true,
      data: result.ban,
    });
  } catch (error: any) {
    console.error('[Bans] Error creating ban:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create ban',
    });
  }
});

/**
 * Lift (unban) a user
 * POST /api/bans/:id/lift
 */
router.post('/:id/lift', authMiddleware, requireRole(['super_admin', 'admin', 'auditor']), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Get ban info before lifting for audit log
    const ban = await banService.getBan(id);
    const { data: user } = ban?.user_id
      ? await supabase.from('users').select('display_name, username, email').eq('id', ban.user_id).single()
      : { data: null };
    const userName = user?.display_name || user?.username || user?.email?.split('@')[0];

    const result = await banService.unbanUser(id, req.user!.userId);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
      });
    }

    // Audit log: user unbanned
    await auditService.logBan(req, 'user_unbanned', id, ban?.user_id || '', userName);

    res.json({
      success: true,
      message: 'Ban lifted successfully',
    });
  } catch (error: any) {
    console.error('[Bans] Error lifting ban:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to lift ban',
    });
  }
});

/**
 * Get all active bans
 * GET /api/bans
 */
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const bans = await banService.getActiveBans();

    res.json({
      success: true,
      data: bans,
    });
  } catch (error: any) {
    console.error('[Bans] Error getting bans:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get bans',
    });
  }
});

/**
 * Get recent bans (active + lifted) for activity feed
 * GET /api/bans/recent
 */
router.get('/recent', authMiddleware, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
    const bans = await banService.getRecentBans(limit);

    res.json({
      success: true,
      data: bans,
    });
  } catch (error: any) {
    console.error('[Bans] Error getting recent bans:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get recent bans',
    });
  }
});

/**
 * Get ban statistics
 * GET /api/bans/stats
 */
router.get('/stats', authMiddleware, async (req: Request, res: Response) => {
  try {
    const stats = await banService.getBanStats();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    console.error('[Bans] Error getting ban stats:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get ban statistics',
    });
  }
});

/**
 * Get bans for a specific user
 * GET /api/bans/user/:userId
 */
router.get('/user/:userId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const bans = await banService.getUserBans(userId);

    res.json({
      success: true,
      data: bans,
    });
  } catch (error: any) {
    console.error('[Bans] Error getting user bans:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get user bans',
    });
  }
});

/**
 * Check if a user is banned (for connection check)
 * GET /api/bans/check/:userId
 * Must be before /:id to avoid route conflicts
 */
router.get('/check/:userId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const result = await banService.isUserBanned(userId);

    res.json({
      success: true,
      data: {
        banned: result.banned,
        ban: result.ban,
      },
    });
  } catch (error: any) {
    console.error('[Bans] Error checking ban:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to check ban status',
    });
  }
});

/**
 * Freeze: ban user globally + disable server + terminate session
 * POST /api/bans/freeze
 */
router.post('/freeze', authMiddleware, requireRole(['super_admin', 'admin', 'auditor']), async (req: Request, res: Response) => {
  try {
    const { userId, serverId, reason, sessionId } = req.body as FreezeRequest;

    if (!userId || !serverId) {
      return res.status(400).json({
        success: false,
        error: 'userId and serverId are required',
      });
    }

    if (!reason || reason.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'reason is required',
      });
    }

    if (userId === req.user?.userId) {
      return res.status(400).json({
        success: false,
        error: 'You cannot freeze yourself',
      });
    }

    // Prevent freezing super_admin users
    const { data: targetUser } = await supabase.from('users').select('role').eq('id', userId).single();
    if (targetUser?.role === 'super_admin') {
      return res.status(403).json({
        success: false,
        error: 'Cannot freeze a super admin user',
      });
    }

    // 1. Create a permanent global ban
    const banResult = await banService.banUser({
      userId,
      bannedBy: req.user!.userId,
      reason: reason.trim(),
      duration: 'permanent',
      sessionId,
    });

    // 2. Disable the server
    const { error: serverError } = await supabase
      .from('servers')
      .update({ enabled: false })
      .eq('id', serverId);

    if (serverError) {
      console.error('[Bans] Failed to disable server during freeze:', serverError);
    }

    // 3. Terminate active session if provided
    if (sessionId) {
      const { error: sessionError } = await supabase
        .from('sessions')
        .update({ status: 'terminated', ended_at: new Date().toISOString() })
        .eq('id', sessionId)
        .in('status', ['connecting', 'active']);

      if (sessionError) {
        console.error('[Bans] Failed to terminate session during freeze:', sessionError);
      }
    }

    // Get user info for audit log
    const { data: user } = await supabase.from('users').select('display_name, username, email').eq('id', userId).single();
    const userName = user?.display_name || user?.username || user?.email?.split('@')[0];

    await auditService.logBan(req, 'user_banned', banResult.ban?.id || '', userId, userName, reason, 'permanent');

    res.json({
      success: true,
      data: {
        ban: banResult.ban,
        serverDisabled: !serverError,
        sessionTerminated: !!sessionId,
      },
    });
  } catch (error: any) {
    console.error('[Bans] Error during freeze:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to freeze user and server',
    });
  }
});

/**
 * Get a specific ban
 * GET /api/bans/:id
 */
router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const ban = await banService.getBan(id);

    if (!ban) {
      return res.status(404).json({
        success: false,
        error: 'Ban not found',
      });
    }

    res.json({
      success: true,
      data: ban,
    });
  } catch (error: any) {
    console.error('[Bans] Error getting ban:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get ban',
    });
  }
});

export default router;
