import { Router, Request, Response } from 'express';
import { authService } from '../services/auth.service.js';
import { auditService } from '../services/audit.service.js';

const router = Router();

/**
 * Check if setup is required
 */
router.get('/setup/status', async (req: Request, res: Response) => {
  try {
    const setupRequired = await authService.isSetupRequired();

    res.json({
      success: true,
      data: {
        setupRequired,
        reason: setupRequired ? 'no_users_exist' : null,
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
 * Create super admin (setup wizard)
 */
router.post('/setup/create-admin', async (req: Request, res: Response) => {
  try {
    const { username, password, displayName } = req.body;

    if (!username || !password || !displayName) {
      return res.status(400).json({
        success: false,
        error: 'Username, password, and display name are required',
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

    const user = await authService.createSuperAdmin(username, password, displayName);

    res.status(201).json({
      success: true,
      data: user,
      message: 'Super admin account created successfully',
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Login with username and password
 */
router.post('/login', async (req: Request, res: Response) => {
  const { username, password } = req.body || {};

  try {
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username and password are required',
      });
    }

    const { user, token } = await authService.login(username, password);

    // Audit log: successful login
    await auditService.logLogin(req, user.id, username, true);

    res.json({
      success: true,
      data: {
        user,
        token,
      },
    });
  } catch (error: any) {
    // Audit log: failed login
    await auditService.logLogin(req, '', username || '', false);

    res.status(401).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Get current user (validate token)
 */
router.get('/me', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'No token provided',
      });
    }

    const token = authHeader.substring(7);
    const payload = authService.verifyToken(token);

    if (!payload) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token',
      });
    }

    const user = await authService.getUserById(payload.userId);

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User not found',
      });
    }

    if (!user.enabled) {
      return res.status(401).json({
        success: false,
        error: 'Account is disabled',
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
 * Change password
 */
router.post('/change-password', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'No token provided',
      });
    }

    const token = authHeader.substring(7);
    const payload = authService.verifyToken(token);

    if (!payload) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token',
      });
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Current password and new password are required',
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'New password must be at least 6 characters',
      });
    }

    // Verify current password by attempting login
    try {
      const user = await authService.getUserById(payload.userId);
      if (!user) throw new Error('User not found');
      await authService.login(user.username, currentPassword);
    } catch {
      return res.status(400).json({
        success: false,
        error: 'Current password is incorrect',
      });
    }

    // Update password
    await authService.updateUser(payload.userId, { password: newPassword });

    // Audit log: password changed
    const user = await authService.getUserById(payload.userId);
    await auditService.log({
      actorId: payload.userId,
      actorName: user?.display_name || user?.username,
      action: 'password_changed',
      resourceType: 'auth',
      resourceId: payload.userId,
      ipAddress: auditService.getIpFromRequest(req),
    });

    res.json({
      success: true,
      message: 'Password changed successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
