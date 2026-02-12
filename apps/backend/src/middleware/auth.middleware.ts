import { Request, Response, NextFunction } from 'express';
import { authService, JWTPayload } from '../services/auth.service.js';
import type { Permission } from '@smartaiaudit/shared';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
      permissions?: Record<string, boolean>;
    }
  }
}

/**
 * Authentication middleware - validates JWT token
 */
export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: 'No token provided',
      });
      return;
    }

    const token = authHeader.substring(7);
    const payload = authService.verifyToken(token);

    if (!payload) {
      res.status(401).json({
        success: false,
        error: 'Invalid or expired token',
      });
      return;
    }

    // Verify user still exists and is enabled
    const user = await authService.getUserById(payload.userId);

    if (!user) {
      res.status(401).json({
        success: false,
        error: 'User not found',
      });
      return;
    }

    if (!user.enabled) {
      res.status(401).json({
        success: false,
        error: 'Account is disabled',
      });
      return;
    }

    // Attach user info to request
    req.user = payload;

    // Load permissions for the user's role
    const permissions = await authService.getRolePermissions(payload.role);
    req.permissions = permissions;

    next();
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Authentication error',
    });
  }
};

/**
 * Role-based access control middleware
 */
export const requireRole = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Not authenticated',
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
      });
      return;
    }

    next();
  };
};

/**
 * Super admin only middleware
 */
export const requireSuperAdmin = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
    return;
  }

  if (req.user.role !== 'super_admin') {
    res.status(403).json({
      success: false,
      error: 'Super admin access required',
    });
    return;
  }

  next();
};

/**
 * Admin or super admin middleware
 */
export const requireAdmin = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
    return;
  }

  if (!['super_admin', 'admin'].includes(req.user.role)) {
    res.status(403).json({
      success: false,
      error: 'Admin access required',
    });
    return;
  }

  next();
};

/**
 * Permission-based access control middleware
 * Checks if the user has the required permission
 */
export const requirePermission = (permission: Permission) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Not authenticated',
      });
      return;
    }

    // Super admin has all permissions
    if (req.permissions?.all === true) {
      next();
      return;
    }

    // Check specific permission
    if (!req.permissions?.[permission]) {
      res.status(403).json({
        success: false,
        error: `Permission denied: ${permission}`,
      });
      return;
    }

    next();
  };
};

/**
 * Check multiple permissions (any of them)
 */
export const requireAnyPermission = (permissions: Permission[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Not authenticated',
      });
      return;
    }

    // Super admin has all permissions
    if (req.permissions?.all === true) {
      next();
      return;
    }

    // Check if user has any of the required permissions
    const hasPermission = permissions.some((p) => req.permissions?.[p] === true);

    if (!hasPermission) {
      res.status(403).json({
        success: false,
        error: `Permission denied: requires one of [${permissions.join(', ')}]`,
      });
      return;
    }

    next();
  };
};
