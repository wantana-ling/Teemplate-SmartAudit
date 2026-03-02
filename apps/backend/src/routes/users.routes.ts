import { Router, Request, Response } from 'express';
import { authService } from '../services/auth.service.js';
import { authMiddleware, requireRole } from '../middleware/auth.middleware.js';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

/**
 * Get all users (admin/super_admin only)
 */
router.get('/', requireRole(['super_admin', 'admin', 'auditor']), async (req: Request, res: Response) => {
  try {
    const { role, search } = req.query;
    const users = await authService.getUsers({
      role: role as string | undefined,
      search: search as string | undefined,
    });

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
 * Get single user by ID
 */
router.get('/:id', requireRole(['super_admin', 'admin', 'auditor']), async (req: Request, res: Response) => {
  try {
    const user = await authService.getUserById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    res.json({
      success: true,
      data: user,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Create new user (admin/super_admin only)
 */
router.post('/', requireRole(['super_admin', 'admin']), async (req: Request, res: Response) => {
  try {
    const { username, password, displayName, role, department } = req.body;
    const currentUser = (req as any).user;

    if (!username || !password || !displayName || !role) {
      return res.status(400).json({
        success: false,
        error: 'Username, password, display name, and role are required',
      });
    }

    if (username.length < 3) {
      return res.status(400).json({
        success: false,
        error: 'Username must be at least 3 characters',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 6 characters',
      });
    }

    // Only super_admin can create admin users
    if (role === 'admin' && currentUser.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        error: 'Only super admin can create admin users',
      });
    }

    // Cannot create super_admin through this endpoint
    if (role === 'super_admin') {
      return res.status(403).json({
        success: false,
        error: 'Cannot create super admin through this endpoint',
      });
    }

    const validRoles = ['admin', 'auditor', 'client'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        error: `Invalid role. Must be one of: ${validRoles.join(', ')}`,
      });
    }

    const user = await authService.createUser(
      username,
      password,
      displayName,
      role as 'admin' | 'auditor' | 'client',
      currentUser.userId,
      department
    );

    res.status(201).json({
      success: true,
      data: user,
      message: 'User created successfully',
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Update user
 */
router.put('/:id', requireRole(['super_admin', 'admin']), async (req: Request, res: Response) => {
  try {
    const { username, displayName, email, enabled, password, department, role } = req.body;
    const currentUser = (req as any).user;
    const targetUserId = req.params.id;

    // Get target user to check permissions
    const targetUser = await authService.getUserById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    // Only super_admin can modify super_admin users
    if (targetUser.role === 'super_admin' && currentUser.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
      });
    }

    // Prevent changing role to super_admin
    if (role && role === 'super_admin' && currentUser.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
      });
    }

    const updates: any = {};
    if (username !== undefined) updates.username = username;
    if (displayName !== undefined) updates.display_name = displayName;
    if (email !== undefined) updates.email = email;
    if (department !== undefined) updates.department = department;
    if (enabled !== undefined) updates.enabled = enabled;
    if (password !== undefined) updates.password = password;
    if (role !== undefined) updates.role = role;

    const user = await authService.updateUser(targetUserId, updates);

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
 * Delete user (super_admin only)
 */
router.delete('/:id', requireRole(['super_admin', 'admin']), async (req: Request, res: Response) => {
  try {
    const currentUser = (req as any).user;
    const targetUserId = req.params.id;

    // Prevent self-deletion
    if (targetUserId === currentUser.userId) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete your own account',
      });
    }

    // Get target user to verify exists
    const targetUser = await authService.getUserById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    // Prevent deleting super_admin
    if (targetUser.role === 'super_admin') {
      return res.status(403).json({
        success: false,
        error: 'Cannot delete super admin account',
      });
    }

    await authService.deleteUser(targetUserId);

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

/**
 * Toggle user enabled status
 */
router.post('/:id/toggle-enabled', requireRole(['super_admin', 'admin']), async (req: Request, res: Response) => {
  try {
    const currentUser = (req as any).user;
    const targetUserId = req.params.id;

    const targetUser = await authService.getUserById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    // Only super_admin can toggle super_admin users
    if (targetUser.role === 'super_admin' && currentUser.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
      });
    }

    // Prevent disabling yourself
    if (targetUserId === currentUser.userId) {
      return res.status(400).json({
        success: false,
        error: 'Cannot disable your own account',
      });
    }

    const user = await authService.updateUser(targetUserId, {
      enabled: !targetUser.enabled,
    });

    res.json({
      success: true,
      data: user,
      message: `User ${user.enabled ? 'enabled' : 'disabled'} successfully`,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Reset user password (admin sets new password)
 */
router.post('/:id/reset-password', requireRole(['super_admin', 'admin']), async (req: Request, res: Response) => {
  try {
    const { newPassword } = req.body;
    const currentUser = (req as any).user;
    const targetUserId = req.params.id;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'New password must be at least 6 characters',
      });
    }

    const targetUser = await authService.getUserById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    // Only super_admin can reset super_admin passwords
    if (targetUser.role === 'super_admin' && currentUser.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
      });
    }

    await authService.updateUser(targetUserId, { password: newPassword });

    res.json({
      success: true,
      message: 'Password reset successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
