import { Router, Request, Response } from 'express';
import { supabase } from '../config/supabase.js';
import { createConnectionToken } from '../services/guacamole-token.service.js';
import { sessionService } from '../services/session.service.js';
import { serverAccessService } from '../services/server-access.service.js';
import { banService } from '../services/ban.service.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

const router = Router();

/**
 * Get servers accessible to the authenticated user
 * Returns servers grouped by access type (direct or via group)
 *
 * GET /api/connections
 * Returns: { servers: [...], groupedByGroup: { groupId: { group: {...}, servers: [...] } } }
 */
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated',
      });
    }

    // Get all server IDs the user can access
    const accessibleServerIds = await serverAccessService.getUserAccessibleServers(userId);

    if (accessibleServerIds.length === 0) {
      return res.json({
        success: true,
        data: {
          servers: [],
          groupedByGroup: {},
        },
      });
    }

    // Fetch server details (excluding credentials for client apps)
    // Only return enabled servers to clients
    const { data: servers, error: serverError } = await supabase
      .from('servers')
      .select('id, name, host, port, protocol, description, tags, department, created_at')
      .in('id', accessibleServerIds)
      .eq('enabled', true);

    if (serverError) {
      throw new Error(serverError.message);
    }

    // Query active sessions to annotate servers with lock status
    const serverIds = (servers || []).map((s: any) => s.id);
    let activeSessionMap: Record<string, string> = {};
    if (serverIds.length > 0) {
      const { data: activeSessions } = await supabase
        .from('sessions')
        .select('server_id, user_id, users!user_id(display_name, username)')
        .in('server_id', serverIds)
        .in('status', ['connecting', 'active']);

      if (activeSessions) {
        for (const session of activeSessions) {
          const userInfo = (session as any).users;
          activeSessionMap[session.server_id] = userInfo?.display_name || userInfo?.username || 'Another user';
        }
      }
    }

    // Annotate servers with lock status
    const annotatedServers = (servers || []).map((s: any) => ({
      ...s,
      inUse: !!activeSessionMap[s.id],
      activeUser: activeSessionMap[s.id] || undefined,
    }));

    // Get user's group memberships
    const { data: userGroups } = await supabase
      .from('user_groups')
      .select(`
        group_id,
        group:groups!group_id (
          id,
          name,
          color,
          description
        )
      `)
      .eq('user_id', userId);

    // Get which servers are accessible via which groups
    const groupIds = (userGroups || []).map((ug: any) => ug.group_id);

    let groupServerAccess: any[] = [];
    if (groupIds.length > 0) {
      const { data: groupAccess } = await supabase
        .from('server_access')
        .select('server_id, group_id')
        .in('group_id', groupIds);
      groupServerAccess = groupAccess || [];
    }

    // Get direct access servers
    const { data: directAccess } = await supabase
      .from('server_access')
      .select('server_id')
      .eq('user_id', userId);

    const directServerIds = new Set((directAccess || []).map((a: any) => a.server_id));

    // Build grouped structure
    const groupedByGroup: Record<string, { group: any; servers: any[] }> = {};

    // Add group-based servers
    for (const access of groupServerAccess) {
      const groupInfo = (userGroups || []).find((ug: any) => ug.group_id === access.group_id);
      if (groupInfo && groupInfo.group) {
        if (!groupedByGroup[access.group_id]) {
          groupedByGroup[access.group_id] = {
            group: groupInfo.group,
            servers: [],
          };
        }
        const server = annotatedServers.find((s: any) => s.id === access.server_id);
        if (server && !groupedByGroup[access.group_id].servers.find((s: any) => s.id === server.id)) {
          groupedByGroup[access.group_id].servers.push(server);
        }
      }
    }

    // Add department-matched servers under a special "department" key
    const { data: currentUser } = await supabase
      .from('users')
      .select('department')
      .eq('id', userId)
      .single();

    if (currentUser?.department) {
      const deptServers = annotatedServers.filter((s: any) =>
        Array.isArray(s.department) && s.department.includes(currentUser.department)
      );
      if (deptServers.length > 0) {
        groupedByGroup['department'] = {
          group: {
            id: 'department',
            name: `Department: ${currentUser.department}`,
            color: '#8B5CF6',
            description: `Servers assigned to ${currentUser.department} department`,
          },
          servers: deptServers,
        };
      }
    }

    // Add direct access servers under a special "direct" key
    const directServers = annotatedServers.filter((s: any) => directServerIds.has(s.id));
    if (directServers.length > 0) {
      groupedByGroup['direct'] = {
        group: {
          id: 'direct',
          name: 'Direct Access',
          color: '#3B82F6',
          description: 'Servers you have direct access to',
        },
        servers: directServers,
      };
    }

    res.json({
      success: true,
      data: {
        servers: annotatedServers,
        groupedByGroup,
      },
    });
  } catch (error: any) {
    console.error('[Connections] Error getting accessible servers:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get accessible servers',
    });
  }
});

/**
 * Generate a connection token for a server
 * This creates a new session and returns an encrypted token for guacamole-lite
 *
 * POST /api/connections/token
 * Body: { serverId, clientUserId }
 * Returns: { token, sessionId, wsUrl }
 */
router.post('/token', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { serverId } = req.body;
    const clientUserId = req.user?.userId;

    if (!serverId) {
      return res.status(400).json({
        success: false,
        error: 'serverId is required',
      });
    }

    if (!clientUserId) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated',
      });
    }

    // Check if user is globally banned
    const banStatus = await banService.isUserBanned(clientUserId);
    if (banStatus.banned) {
      return res.status(403).json({
        success: false,
        error: `You are globally banned: ${banStatus.ban?.reason}`,
        ban: {
          reason: banStatus.ban?.reason,
          expires_at: banStatus.ban?.expires_at,
          is_global: true,
        },
      });
    }

    // Verify user has access to this server
    const hasAccess = await serverAccessService.userHasAccess(clientUserId, serverId);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'You do not have access to this server',
      });
    }

    // Get server details from database
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

    // Check if server is enabled
    if (!server.enabled) {
      return res.status(403).json({
        success: false,
        error: 'This server is currently disabled',
      });
    }

    // Check if server already has an active session (exclusive access)
    const { data: activeSessions } = await supabase
      .from('sessions')
      .select('id, user_id, users!user_id(display_name, username)')
      .eq('server_id', serverId)
      .in('status', ['connecting', 'active'])
      .limit(1);

    if (activeSessions && activeSessions.length > 0) {
      const activeUser = (activeSessions[0] as any).users;
      return res.status(409).json({
        success: false,
        error: 'Server is currently in use',
        activeUser: activeUser?.display_name || activeUser?.username || 'Another user',
      });
    }

    // Create a new session
    const session = await sessionService.createSession({
      server_id: serverId,
      client_user_id: clientUserId,
    });

    if (!session) {
      return res.status(500).json({
        success: false,
        error: 'Failed to create session',
      });
    }

    const sessionId = session.id;

    // Generate encrypted connection token
    const token = createConnectionToken(
      {
        host: server.host,
        port: server.port,
        protocol: server.protocol,
        username: server.username,
        password: server.password,
      },
      sessionId
    );

    // Return token and session info
    res.json({
      success: true,
      data: {
        token,
        sessionId,
        wsUrl: `/ws?token=${encodeURIComponent(token)}`,
        server: {
          id: server.id,
          name: server.name,
          protocol: server.protocol,
        },
      },
    });
  } catch (error: any) {
    console.error('[Connections] Error generating token:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate connection token',
    });
  }
});

/**
 * Test connection to a server without creating a session
 * Useful for validating server settings before saving
 *
 * POST /api/connections/test
 * Body: { host, port, protocol, username?, password? }
 */
router.post('/test', async (req: Request, res: Response) => {
  try {
    const { host, port, protocol } = req.body;

    if (!host || !port || !protocol) {
      return res.status(400).json({
        success: false,
        error: 'host, port, and protocol are required',
      });
    }

    // For now, just validate the parameters
    // In production, we could attempt a quick connection test
    const validProtocols = ['ssh', 'rdp', 'vnc'];
    if (!validProtocols.includes(protocol)) {
      return res.status(400).json({
        success: false,
        error: `Invalid protocol. Must be one of: ${validProtocols.join(', ')}`,
      });
    }

    if (port < 1 || port > 65535) {
      return res.status(400).json({
        success: false,
        error: 'Port must be between 1 and 65535',
      });
    }

    res.json({
      success: true,
      message: 'Connection parameters are valid',
      data: {
        host,
        port,
        protocol,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
