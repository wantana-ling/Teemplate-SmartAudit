import { Router, Request, Response } from 'express';
import { supabase } from '../config/supabase.js';
import { serverAccessService } from '../services/server-access.service.js';
import { authMiddleware, requireRole } from '../middleware/auth.middleware.js';
import { recordingService } from '../services/recording.service.js';
import { auditService } from '../services/audit.service.js';
import { ruleLoaderService } from '../services/rule-loader.service.js';
import { riskDetectionService } from '../services/risk-detection.service.js';

const router = Router();

// Apply auth middleware to all admin routes
router.use(authMiddleware);

// ============ Dashboard ============

/**
 * Get dashboard statistics
 */
router.get('/dashboard/stats', async (req: Request, res: Response) => {
  try {
    // Get active sessions count
    const { count: activeSessions } = await supabase
      .from('sessions')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');

    // Get total users count (from users table)
    const { count: totalUsers } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });

    // Get total servers count
    const { count: totalServers } = await supabase
      .from('servers')
      .select('*', { count: 'exact', head: true });

    // Get risk distribution (only unreviewed sessions)
    const { data: riskData } = await supabase
      .from('sessions')
      .select('risk_level')
      .not('risk_level', 'is', null)
      .or('reviewed.is.null,reviewed.eq.false');

    const riskDistribution = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };

    riskData?.forEach((session) => {
      const level = session.risk_level as keyof typeof riskDistribution;
      if (level in riskDistribution) {
        riskDistribution[level]++;
      }
    });

    // Get sessions today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { count: sessionsToday } = await supabase
      .from('sessions')
      .select('*', { count: 'exact', head: true })
      .gte('started_at', today.toISOString());

    // Get sessions this week
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const { count: sessionsThisWeek } = await supabase
      .from('sessions')
      .select('*', { count: 'exact', head: true })
      .gte('started_at', weekAgo.toISOString());

    res.json({
      success: true,
      data: {
        activeSessions: activeSessions || 0,
        totalUsers: totalUsers || 0,
        totalServers: totalServers || 0,
        riskDistribution,
        sessionsToday: sessionsToday || 0,
        sessionsThisWeek: sessionsThisWeek || 0,
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
 * Get recent activity feed
 */
router.get('/dashboard/activity', async (req: Request, res: Response) => {
  try {
    const limit = Number(req.query.limit) || 20;

    // Get recent sessions as activity
    const { data: sessions, error } = await supabase
      .from('sessions')
      .select('id, status, started_at, ended_at, risk_level, servers(name)')
      .order('started_at', { ascending: false })
      .limit(limit);

    if (error) {
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }

    const activities = sessions?.map((session) => {
      const isEnded = session.ended_at !== null;
      return {
        id: session.id,
        type: isEnded ? 'session_end' : 'session_start',
        message: isEnded
          ? `Session ended on ${(session.servers as any)?.name || 'Unknown server'}`
          : `Session started on ${(session.servers as any)?.name || 'Unknown server'}`,
        timestamp: isEnded ? session.ended_at : session.started_at,
        sessionId: session.id,
        serverName: (session.servers as any)?.name,
        riskLevel: session.risk_level,
      };
    }) || [];

    res.json({
      success: true,
      data: activities,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Process and upload recordings for sessions that don't have them
 */
router.post('/recordings/process', async (req: Request, res: Response) => {
  try {
    // Find sessions without recordings
    const { data: sessions, error } = await supabase
      .from('sessions')
      .select('id')
      .is('guac_recording_url', null)
      .eq('status', 'disconnected')
      .limit(50);

    if (error) {
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }

    const results: { sessionId: string; success: boolean; path?: string; error?: string }[] = [];

    for (const session of sessions || []) {
      try {
        const storagePath = await recordingService.uploadGuacRecording(session.id);
        results.push({
          sessionId: session.id,
          success: !!storagePath,
          path: storagePath || undefined,
        });
      } catch (err: any) {
        results.push({
          sessionId: session.id,
          success: false,
          error: err.message,
        });
      }
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    res.json({
      success: true,
      data: {
        processed: results.length,
        successful,
        failed,
        results,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============ Users ============

/**
 * List all client users
 */
router.get('/users', async (req: Request, res: Response) => {
  try {
    const { search, status, limit = 50, offset = 0 } = req.query;

    let query = supabase
      .from('client_users')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(Number(limit))
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (search) {
      query = query.or(`email.ilike.%${search}%,name.ilike.%${search}%`);
    }

    if (status === 'active') {
      query = query.eq('enabled', true);
    } else if (status === 'disabled') {
      query = query.eq('enabled', false);
    }

    const { data: users, error } = await query;

    if (error) {
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }

    // Get session counts for each user
    const usersWithCounts = await Promise.all(
      (users || []).map(async (user) => {
        const { count } = await supabase
          .from('sessions')
          .select('*', { count: 'exact', head: true })
          .eq('client_user_id', user.id);

        return {
          ...user,
          session_count: count || 0,
        };
      })
    );

    res.json({
      success: true,
      data: usersWithCounts,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Create a new client user
 */
router.post('/users', async (req: Request, res: Response) => {
  try {
    const { email, name, role = 'user' } = req.body;

    if (!email || !name) {
      return res.status(400).json({
        success: false,
        error: 'Email and name are required',
      });
    }

    // Create user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password: Math.random().toString(36).slice(-12), // Temporary password
      email_confirm: true,
    });

    if (authError) {
      return res.status(400).json({
        success: false,
        error: authError.message,
      });
    }

    // Create client user profile
    const { data: user, error } = await supabase
      .from('client_users')
      .insert({
        id: authData.user.id,
        email,
        name,
        role,
        enabled: true,
      })
      .select()
      .single();

    if (error) {
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }

    // Audit log: user created
    await auditService.logUserAction(req, 'user_created', user.id, name, { email, role });

    res.status(201).json({
      success: true,
      data: user,
      message: 'User created successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Update a client user
 */
router.put('/users/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, role, enabled } = req.body;

    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (role !== undefined) updates.role = role;
    if (enabled !== undefined) updates.enabled = enabled;

    const { data: user, error } = await supabase
      .from('client_users')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }

    // Audit log: user updated (with specific action for enable/disable)
    const action = enabled === false ? 'user_disabled' : enabled === true ? 'user_enabled' : 'user_updated';
    await auditService.logUserAction(req, action, id, user?.name, updates);

    res.json({
      success: true,
      data: user,
      message: 'User updated successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Delete a client user
 */
router.delete('/users/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Get user info before deletion for audit log
    const { data: userToDelete } = await supabase
      .from('client_users')
      .select('name, email')
      .eq('id', id)
      .single();

    // Delete from client_users
    const { error } = await supabase
      .from('client_users')
      .delete()
      .eq('id', id);

    if (error) {
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }

    // Audit log: user deleted
    await auditService.logUserAction(req, 'user_deleted', id, userToDelete?.name, { email: userToDelete?.email });

    // Also delete from auth (optional, might want to keep for audit)
    // await supabase.auth.admin.deleteUser(id);

    res.json({
      success: true,
      message: 'User deleted successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============ Servers ============

/**
 * List all servers (admin view)
 */
router.get('/servers', async (req: Request, res: Response) => {
  try {
    const { search, status } = req.query;

    let query = supabase
      .from('servers')
      .select('*')
      .order('created_at', { ascending: false });

    if (search) {
      const searchStr = String(search);
      if (searchStr.includes(':')) {
        const [hostPart, portPart] = searchStr.split(':');
        query = query.ilike('host', `%${hostPart}%`);
        if (portPart) {
          query = query.eq('port', Number(portPart));
        }
      } else {
        query = query.or(`name.ilike.%${search}%,host.ilike.%${search}%`);
      }
    }

    if (status === 'enabled') {
      query = query.eq('enabled', true);
    } else if (status === 'disabled') {
      query = query.eq('enabled', false);
    }

    const { data: servers, error } = await query;

    if (error) {
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }

    // Get active session counts
    const serversWithCounts = await Promise.all(
      (servers || []).map(async (server) => {
        const { count } = await supabase
          .from('sessions')
          .select('*', { count: 'exact', head: true })
          .eq('server_id', server.id)
          .eq('status', 'active');

        return {
          ...server,
          active_sessions: count || 0,
        };
      })
    );

    res.json({
      success: true,
      data: serversWithCounts,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Create a new server
 */
router.post('/servers', async (req: Request, res: Response) => {
  try {
    const { name, host, port, protocol, username, password, description } = req.body;
    const currentUser = (req as any).user;

    if (!name || !host || !port || !protocol) {
      return res.status(400).json({
        success: false,
        error: 'Name, host, port, and protocol are required',
      });
    }

    const { data: server, error } = await supabase
      .from('servers')
      .insert({
        name,
        host,
        port,
        protocol,
        username,
        password, // Should be encrypted in production
        description,
        enabled: true,
      })
      .select()
      .single();

    if (error) {
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }

    // Audit log: server created
    await auditService.logServerAction(req, 'server_created', server.id, name, { host, port, protocol });

    res.status(201).json({
      success: true,
      data: server,
      message: 'Server created successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Update a server
 */
router.put('/servers/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, host, port, protocol, username, password, description, enabled } = req.body;

    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (host !== undefined) updates.host = host;
    if (port !== undefined) updates.port = port;
    if (protocol !== undefined) updates.protocol = protocol;
    if (username !== undefined) updates.username = username;
    if (password) updates.password = password; // Only update if provided
    if (description !== undefined) updates.description = description;
    if (enabled !== undefined) updates.enabled = enabled;

    const { data: server, error } = await supabase
      .from('servers')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }

    // Audit log: server updated (with specific action for enable/disable)
    const action = enabled === false ? 'server_disabled' : enabled === true ? 'server_enabled' : 'server_updated';
    await auditService.logServerAction(req, action, id, server?.name, updates);

    res.json({
      success: true,
      data: server,
      message: 'Server updated successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Delete a server
 */
router.delete('/servers/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Get server info before deletion for audit log
    const { data: serverToDelete } = await supabase
      .from('servers')
      .select('name, host')
      .eq('id', id)
      .single();

    // Check for active sessions
    const { count: activeSessions } = await supabase
      .from('sessions')
      .select('*', { count: 'exact', head: true })
      .eq('server_id', id)
      .eq('status', 'active');

    if (activeSessions && activeSessions > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete server with active sessions',
      });
    }

    const { error } = await supabase
      .from('servers')
      .delete()
      .eq('id', id);

    if (error) {
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }

    // Audit log: server deleted
    await auditService.logServerAction(req, 'server_deleted', id, serverToDelete?.name, { host: serverToDelete?.host });

    res.json({
      success: true,
      message: 'Server deleted successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============ Sessions (Admin) ============

/**
 * Terminate an active session
 */
router.post('/sessions/:id/terminate', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Get session info for audit log
    const { data: sessionInfo } = await supabase
      .from('sessions')
      .select('id, servers(name)')
      .eq('id', id)
      .single();

    const { error } = await supabase
      .from('sessions')
      .update({
        status: 'disconnected',
        ended_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }

    // Audit log: session terminated
    await auditService.logSessionTerminated(req, id, (sessionInfo?.servers as any)?.name);

    // TODO: Also disconnect the actual Guacamole connection

    res.json({
      success: true,
      message: 'Session terminated successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Re-analyze a session
 */
router.post('/sessions/:id/analyze', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Get the session
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', id)
      .single();

    if (sessionError || !session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
      });
    }

    // TODO: Re-run LLM analysis

    res.json({
      success: true,
      message: 'Analysis queued',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============ Settings ============

/**
 * Get system settings
 */
router.get('/settings', async (req: Request, res: Response) => {
  try {
    const { data: settings, error } = await supabase
      .from('system_settings')
      .select('*');

    if (error) {
      // Table might not exist yet
      return res.json({
        success: true,
        data: {},
      });
    }

    const settingsObject = (settings || []).reduce((acc, item) => {
      acc[item.key] = item.value;
      return acc;
    }, {} as Record<string, any>);

    res.json({
      success: true,
      data: settingsObject,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Update system settings
 */
router.put('/settings', async (req: Request, res: Response) => {
  try {
    const settings = req.body;

    for (const [key, value] of Object.entries(settings)) {
      const { error } = await supabase
        .from('system_settings')
        .upsert(
          {
            key,
            value: String(value),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'key' }
        );

      if (error) {
        console.error(`[Settings] Failed to upsert key "${key}":`, error.message);
        return res.status(500).json({
          success: false,
          error: `Failed to save setting "${key}": ${error.message}`,
        });
      }
    }

    // Audit log: settings updated
    await auditService.logSettingsUpdated(req, settings);

    res.json({
      success: true,
      message: 'Settings updated successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============ Audit Log ============

/**
 * Get audit log entries
 */
router.get('/audit-log', async (req: Request, res: Response) => {
  try {
    const { limit = 50, offset = 0, action } = req.query;

    // Get client user IDs to exclude their logs
    const { data: clientUsers } = await supabase
      .from('users')
      .select('id')
      .eq('role', 'client');

    const clientIds = (clientUsers || []).map((u: any) => u.id);

    let query = supabase
      .from('audit_log')
      .select('*')
      // Exclude client-only actions (session_started/session_ended have no actor_id)
      .not('action', 'in', '("session_started","session_ended")')
      .order('created_at', { ascending: false })
      .limit(Number(limit))
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    // Exclude logs from client-role users
    if (clientIds.length > 0) {
      query = query.not('actor_id', 'in', `(${clientIds.join(',')})`);
    }

    if (action) {
      query = query.eq('action', action);
    }

    const { data: logs, error } = await query;

    if (error) {
      // Table might not exist yet
      return res.json({
        success: true,
        data: [],
      });
    }

    res.json({
      success: true,
      data: logs || [],
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============ Server Access Management ============

/**
 * Get access list for a server
 */
router.get('/servers/:id/access', requireRole(['super_admin', 'admin']), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const access = await serverAccessService.getServerAccess(id);

    res.json({
      success: true,
      data: access,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Grant user access to server
 */
router.post('/servers/:id/access/user', requireRole(['super_admin', 'admin']), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;
    const currentUser = (req as any).user;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required',
      });
    }

    await serverAccessService.grantUserAccess(id, userId, currentUser.userId);

    // Get server and user info for audit log
    const { data: server } = await supabase.from('servers').select('name').eq('id', id).single();
    const { data: user } = await supabase.from('users').select('display_name, username, email').eq('id', userId).single();
    const userName = user?.display_name || user?.username || user?.email?.split('@')[0];

    // Audit log: access granted
    await auditService.logAccessGranted(req, id, server?.name || '', 'user', userId, userName);

    res.json({
      success: true,
      message: 'User access granted',
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Grant group access to server
 */
router.post('/servers/:id/access/group', requireRole(['super_admin', 'admin']), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { groupId } = req.body;
    const currentUser = (req as any).user;

    if (!groupId) {
      return res.status(400).json({
        success: false,
        error: 'Group ID is required',
      });
    }

    await serverAccessService.grantGroupAccess(id, groupId, currentUser.userId);

    // Get server and group info for audit log
    const { data: server } = await supabase.from('servers').select('name').eq('id', id).single();
    const { data: group } = await supabase.from('groups').select('name').eq('id', groupId).single();

    // Audit log: access granted
    await auditService.logAccessGranted(req, id, server?.name || '', 'group', groupId, group?.name);

    res.json({
      success: true,
      message: 'Group access granted',
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Revoke access (user or group)
 */
router.delete('/servers/:id/access/:accessId', requireRole(['super_admin', 'admin']), async (req: Request, res: Response) => {
  try {
    const { id, accessId } = req.params;

    // Get access info before deletion for audit log
    const { data: accessInfo } = await supabase
      .from('server_permissions')
      .select('user_id, group_id')
      .eq('id', accessId)
      .single();

    await serverAccessService.revokeAccess(accessId);

    // Audit log: access revoked
    await auditService.logAccessRevoked(req, id, undefined, accessInfo?.user_id ? 'user' : 'group', accessInfo?.user_id || accessInfo?.group_id);

    res.json({
      success: true,
      message: 'Access revoked',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============ Risk Alerts ============

/**
 * Get unacknowledged risk alerts
 */
router.get('/risk-alerts', requireRole(['super_admin', 'admin', 'auditor']), async (req: Request, res: Response) => {
  try {
    const { data: alerts, error } = await supabase
      .from('risk_alerts')
      .select(`
        *,
        sessions (
          id,
          server_id,
          servers (name)
        )
      `)
      .eq('acknowledged', false)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      return res.json({
        success: true,
        data: [],
      });
    }

    res.json({
      success: true,
      data: alerts || [],
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Acknowledge a risk alert
 */
router.post('/risk-alerts/:id/acknowledge', requireRole(['super_admin', 'admin', 'auditor']), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const currentUser = (req as any).user;

    // Get alert info for audit log
    const { data: alertInfo } = await supabase
      .from('risk_alerts')
      .select('session_id, severity')
      .eq('id', id)
      .single();

    const { error } = await supabase
      .from('risk_alerts')
      .update({
        acknowledged: true,
        acknowledged_by: currentUser.userId,
        acknowledged_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }

    // Audit log: alert acknowledged
    await auditService.logAlertAcknowledged(req, id, alertInfo?.session_id);

    res.json({
      success: true,
      message: 'Alert acknowledged',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Get risk alerts for a session
 */
router.get('/sessions/:id/risk-alerts', requireRole(['super_admin', 'admin', 'auditor']), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { data: alerts, error } = await supabase
      .from('risk_alerts')
      .select('*')
      .eq('session_id', id)
      .order('created_at', { ascending: false });

    if (error) {
      return res.json({
        success: true,
        data: [],
      });
    }

    res.json({
      success: true,
      data: alerts || [],
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============ Detection Rules ============

/**
 * Get current detection rules metadata and scoring config
 */
router.get('/rules', requireRole(['super_admin', 'admin']), async (req: Request, res: Response) => {
  try {
    const rules = ruleLoaderService.getRules();
    res.json({
      success: true,
      data: {
        metadata: rules.metadata,
        scoring: rules.scoring,
        patternCounts: {
          critical: rules.patterns.critical?.length ?? 0,
          high: rules.patterns.high?.length ?? 0,
          medium: rules.patterns.medium?.length ?? 0,
          low: rules.patterns.low?.length ?? 0,
        },
        sequenceCount: rules.sequences.length,
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
 * Reload detection rules from disk
 */
router.post('/rules/reload', requireRole(['super_admin']), async (req: Request, res: Response) => {
  try {
    const result = riskDetectionService.reloadRules();

    if (result.success) {
      // Audit log the reload
      await auditService.logSettingsUpdated(req, { action: 'rules_reloaded', metadata: result.metadata });
    }

    res.json({
      success: result.success,
      error: result.error,
      data: result.metadata,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
