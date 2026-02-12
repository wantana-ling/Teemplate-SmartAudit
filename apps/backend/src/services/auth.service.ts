import { supabase } from '../config/supabase.js';
import { env } from '../config/env.js';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const JWT_SECRET = env.JWT_SECRET;
const JWT_EXPIRES_IN = '24h';

export interface User {
  id: string;
  username: string;
  display_name: string;
  email: string | null;
  role: 'super_admin' | 'admin' | 'auditor' | 'client';
  enabled: boolean;
  avatar_color: string;
  created_at: string;
}

export interface JWTPayload {
  userId: string;
  username: string;
  role: string;
}

class AuthService {
  /**
   * Hash password using SHA-256 with salt
   */
  hashPassword(password: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return `${salt}:${hash}`;
  }

  /**
   * Verify password against hash
   */
  verifyPassword(password: string, storedHash: string): boolean {
    const [salt, hash] = storedHash.split(':');
    const verifyHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return hash === verifyHash;
  }

  /**
   * Generate JWT token
   */
  generateToken(user: User): string {
    const payload: JWTPayload = {
      userId: user.id,
      username: user.username,
      role: user.role,
    };
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  }

  /**
   * Verify JWT token
   */
  verifyToken(token: string): JWTPayload | null {
    try {
      return jwt.verify(token, JWT_SECRET) as JWTPayload;
    } catch {
      return null;
    }
  }

  /**
   * Check if setup is required (no users exist)
   */
  async isSetupRequired(): Promise<boolean> {
    const { count, error } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });

    if (error) {
      // Table might not exist
      return true;
    }

    return count === 0;
  }

  /**
   * Create the first super admin account (setup wizard)
   */
  async createSuperAdmin(username: string, password: string, displayName: string): Promise<User> {
    // Check if any users exist
    const setupRequired = await this.isSetupRequired();
    if (!setupRequired) {
      throw new Error('Setup already completed');
    }

    const passwordHash = this.hashPassword(password);

    const { data: user, error } = await supabase
      .from('users')
      .insert({
        username,
        password_hash: passwordHash,
        display_name: displayName,
        role: 'super_admin',
        enabled: true,
      })
      .select('id, username, display_name, email, role, enabled, avatar_color, created_at')
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return user as User;
  }

  /**
   * Create a new user (admin only)
   */
  async createUser(
    username: string,
    password: string,
    displayName: string,
    role: 'admin' | 'auditor' | 'client',
    createdBy: string
  ): Promise<User> {
    const passwordHash = this.hashPassword(password);

    const { data: user, error } = await supabase
      .from('users')
      .insert({
        username,
        password_hash: passwordHash,
        display_name: displayName,
        role,
        enabled: true,
        created_by: createdBy,
      })
      .select('id, username, display_name, email, role, enabled, avatar_color, created_at')
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new Error('Username already exists');
      }
      throw new Error(error.message);
    }

    return user as User;
  }

  /**
   * Authenticate user with username and password
   */
  async login(username: string, password: string): Promise<{ user: User; token: string }> {
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .single();

    if (error || !user) {
      throw new Error('Invalid username or password');
    }

    if (!user.enabled) {
      throw new Error('Account is disabled');
    }

    if (!this.verifyPassword(password, user.password_hash)) {
      throw new Error('Invalid username or password');
    }

    // Update last login
    await supabase
      .from('users')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', user.id);

    const token = this.generateToken(user as User);

    // Remove password_hash from response
    const { password_hash, ...safeUser } = user;

    return { user: safeUser as User, token };
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: string): Promise<User | null> {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, username, display_name, email, role, enabled, avatar_color, created_at')
      .eq('id', userId)
      .single();

    if (error || !user) {
      return null;
    }

    return user as User;
  }

  /**
   * Get all users
   */
  async getUsers(filters?: { role?: string; search?: string }): Promise<User[]> {
    let query = supabase
      .from('users')
      .select('id, username, display_name, email, role, enabled, avatar_color, created_at, last_login_at')
      .order('created_at', { ascending: false });

    if (filters?.role) {
      query = query.eq('role', filters.role);
    }

    if (filters?.search) {
      query = query.or(`username.ilike.%${filters.search}%,display_name.ilike.%${filters.search}%`);
    }

    const { data: users, error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    return (users || []) as User[];
  }

  /**
   * Update user
   */
  async updateUser(
    userId: string,
    updates: Partial<{ display_name: string; email: string; role: string; enabled: boolean; password: string }>
  ): Promise<User> {
    const updateData: any = {};

    if (updates.display_name) updateData.display_name = updates.display_name;
    if (updates.email !== undefined) updateData.email = updates.email;
    if (updates.role) updateData.role = updates.role;
    if (updates.enabled !== undefined) updateData.enabled = updates.enabled;
    if (updates.password) updateData.password_hash = this.hashPassword(updates.password);

    updateData.updated_at = new Date().toISOString();

    const { data: user, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', userId)
      .select('id, username, display_name, email, role, enabled, avatar_color, created_at')
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return user as User;
  }

  /**
   * Delete user
   */
  async deleteUser(userId: string): Promise<void> {
    const { error } = await supabase.from('users').delete().eq('id', userId);

    if (error) {
      throw new Error(error.message);
    }
  }

  /**
   * Check if user has required role
   */
  hasRole(user: User, allowedRoles: string[]): boolean {
    return allowedRoles.includes(user.role);
  }

  /**
   * Check if user is super admin
   */
  isSuperAdmin(user: User): boolean {
    return user.role === 'super_admin';
  }

  /**
   * Check if user can manage other users
   */
  canManageUsers(user: User): boolean {
    return ['super_admin', 'admin'].includes(user.role);
  }

  /**
   * Check if user can manage servers
   */
  canManageServers(user: User): boolean {
    return ['super_admin', 'admin', 'auditor'].includes(user.role);
  }

  /**
   * Get permissions for a role
   */
  async getRolePermissions(role: string): Promise<Record<string, boolean>> {
    // Default permissions by role (fallback if database not available)
    const defaultPermissions: Record<string, Record<string, boolean>> = {
      super_admin: { all: true },
      admin: {
        'users.view': true,
        'users.create': true,
        'users.edit': true,
        'users.disable': true,
        'servers.view': true,
        'servers.create': true,
        'servers.edit': true,
        'servers.delete': true,
        'groups.view': true,
        'groups.create': true,
        'groups.edit': true,
        'groups.delete': true,
        'sessions.view': true,
        'sessions.terminate': true,
        'sessions.ban': true,
        'sessions.review': true,
        'sessions.tag': true,
        'live.view': true,
        'analytics.view': true,
        'bans.view': true,
        'bans.create': true,
        'bans.lift': true,
      },
      auditor: {
        'users.view': true,
        'sessions.view': true,
        'sessions.terminate': true,
        'sessions.ban': true,
        'sessions.review': true,
        'sessions.tag': true,
        'live.view': true,
        'analytics.view': true,
        'bans.view': true,
        'bans.create': true,
        'bans.lift': true,
        'reports.view': true,
      },
      client: {
        'client.use': true,
      },
    };

    // Try to fetch from database
    try {
      const { data, error } = await supabase
        .from('role_permissions')
        .select('permissions')
        .eq('role', role)
        .single();

      if (!error && data?.permissions) {
        return data.permissions as Record<string, boolean>;
      }
    } catch (e) {
      // Fall through to default
    }

    return defaultPermissions[role] || {};
  }

  /**
   * Check if user has a specific permission
   */
  async checkPermission(userId: string, permission: string): Promise<boolean> {
    const user = await this.getUserById(userId);
    if (!user || !user.enabled) {
      return false;
    }

    const permissions = await this.getRolePermissions(user.role);

    // Super admin has all permissions
    if (permissions.all === true) {
      return true;
    }

    return permissions[permission] === true;
  }

  /**
   * Check if user can terminate sessions
   */
  canTerminateSessions(user: User): boolean {
    return ['super_admin', 'admin', 'auditor'].includes(user.role);
  }

  /**
   * Check if user can ban users
   */
  canBanUsers(user: User): boolean {
    return ['super_admin', 'admin', 'auditor'].includes(user.role);
  }

  /**
   * Check if user can view live sessions
   */
  canViewLive(user: User): boolean {
    return ['super_admin', 'admin', 'auditor'].includes(user.role);
  }
}

export const authService = new AuthService();
