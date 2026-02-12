import { Router, Request, Response } from 'express';
import { groupsService } from '../services/groups.service.js';
import { serverAccessService } from '../services/server-access.service.js';
import { authMiddleware, requireRole } from '../middleware/auth.middleware.js';
import { auditService } from '../services/audit.service.js';
import { supabase } from '../config/supabase.js';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

/**
 * Get all groups
 */
router.get('/', requireRole(['super_admin', 'admin']), async (req: Request, res: Response) => {
  try {
    const groups = await groupsService.getGroups();

    res.json({
      success: true,
      data: groups,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Get single group by ID
 */
router.get('/:id', requireRole(['super_admin', 'admin']), async (req: Request, res: Response) => {
  try {
    const group = await groupsService.getGroupById(req.params.id);

    if (!group) {
      return res.status(404).json({
        success: false,
        error: 'Group not found',
      });
    }

    res.json({
      success: true,
      data: group,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Create new group
 */
router.post('/', requireRole(['super_admin', 'admin']), async (req: Request, res: Response) => {
  try {
    const { name, description, color } = req.body;
    const currentUser = (req as any).user;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Group name is required',
      });
    }

    const group = await groupsService.createGroup(
      name,
      description || null,
      color || '#6B7280',
      currentUser.userId
    );

    // Audit log: group created
    await auditService.logGroupAction(req, 'group_created', group.id, name, { description, color });

    res.status(201).json({
      success: true,
      data: group,
      message: 'Group created successfully',
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Update group
 */
router.put('/:id', requireRole(['super_admin', 'admin']), async (req: Request, res: Response) => {
  try {
    const { name, description, color } = req.body;
    const groupId = req.params.id;

    const existingGroup = await groupsService.getGroupById(groupId);
    if (!existingGroup) {
      return res.status(404).json({
        success: false,
        error: 'Group not found',
      });
    }

    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (color !== undefined) updates.color = color;

    const group = await groupsService.updateGroup(groupId, updates);

    // Audit log: group updated
    await auditService.logGroupAction(req, 'group_updated', groupId, group?.name || existingGroup.name, updates);

    res.json({
      success: true,
      data: group,
      message: 'Group updated successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Delete group
 */
router.delete('/:id', requireRole(['super_admin', 'admin']), async (req: Request, res: Response) => {
  try {
    const groupId = req.params.id;

    const existingGroup = await groupsService.getGroupById(groupId);
    if (!existingGroup) {
      return res.status(404).json({
        success: false,
        error: 'Group not found',
      });
    }

    await groupsService.deleteGroup(groupId);

    // Audit log: group deleted
    await auditService.logGroupAction(req, 'group_deleted', groupId, existingGroup.name);

    res.json({
      success: true,
      message: 'Group deleted successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Get group members
 */
router.get('/:id/members', requireRole(['super_admin', 'admin']), async (req: Request, res: Response) => {
  try {
    const groupId = req.params.id;

    const existingGroup = await groupsService.getGroupById(groupId);
    if (!existingGroup) {
      return res.status(404).json({
        success: false,
        error: 'Group not found',
      });
    }

    const members = await groupsService.getGroupMembers(groupId);

    res.json({
      success: true,
      data: members,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Add member to group
 */
router.post('/:id/members', requireRole(['super_admin', 'admin']), async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;
    const groupId = req.params.id;
    const currentUser = (req as any).user;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required',
      });
    }

    const existingGroup = await groupsService.getGroupById(groupId);
    if (!existingGroup) {
      return res.status(404).json({
        success: false,
        error: 'Group not found',
      });
    }

    await groupsService.addMember(groupId, userId, currentUser.userId);

    // Get user info for audit log
    const { data: user } = await supabase.from('users').select('display_name, username, email').eq('id', userId).single();
    const userName = user?.display_name || user?.username || user?.email?.split('@')[0];

    // Audit log: member added
    await auditService.logGroupMember(req, 'group_member_added', groupId, existingGroup.name, userId, userName);

    res.json({
      success: true,
      message: 'Member added successfully',
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Remove member from group
 */
router.delete('/:id/members/:userId', requireRole(['super_admin', 'admin']), async (req: Request, res: Response) => {
  try {
    const { id: groupId, userId } = req.params;

    const existingGroup = await groupsService.getGroupById(groupId);
    if (!existingGroup) {
      return res.status(404).json({
        success: false,
        error: 'Group not found',
      });
    }

    // Get user info for audit log before removal
    const { data: user } = await supabase.from('users').select('display_name, username, email').eq('id', userId).single();
    const userName = user?.display_name || user?.username || user?.email?.split('@')[0];

    await groupsService.removeMember(groupId, userId);

    // Audit log: member removed
    await auditService.logGroupMember(req, 'group_member_removed', groupId, existingGroup.name, userId, userName);

    res.json({
      success: true,
      message: 'Member removed successfully',
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
 * Get servers assigned to group
 */
router.get('/:id/servers', requireRole(['super_admin', 'admin']), async (req: Request, res: Response) => {
  try {
    const groupId = req.params.id;

    const existingGroup = await groupsService.getGroupById(groupId);
    if (!existingGroup) {
      return res.status(404).json({
        success: false,
        error: 'Group not found',
      });
    }

    const servers = await serverAccessService.getGroupServers(groupId);

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
 * Add server to group (grant group access to server)
 */
router.post('/:id/servers', requireRole(['super_admin', 'admin']), async (req: Request, res: Response) => {
  try {
    const { serverId } = req.body;
    const groupId = req.params.id;
    const currentUser = (req as any).user;

    if (!serverId) {
      return res.status(400).json({
        success: false,
        error: 'Server ID is required',
      });
    }

    const existingGroup = await groupsService.getGroupById(groupId);
    if (!existingGroup) {
      return res.status(404).json({
        success: false,
        error: 'Group not found',
      });
    }

    await serverAccessService.grantGroupAccess(serverId, groupId, currentUser.userId);

    res.json({
      success: true,
      message: 'Server added to group successfully',
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Remove server from group (revoke group access to server)
 */
router.delete('/:id/servers/:serverId', requireRole(['super_admin', 'admin']), async (req: Request, res: Response) => {
  try {
    const { id: groupId, serverId } = req.params;

    const existingGroup = await groupsService.getGroupById(groupId);
    if (!existingGroup) {
      return res.status(404).json({
        success: false,
        error: 'Group not found',
      });
    }

    await serverAccessService.revokeGroupAccess(serverId, groupId);

    res.json({
      success: true,
      message: 'Server removed from group successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
