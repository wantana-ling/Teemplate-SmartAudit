import { supabase } from '../config/supabase.js';

type BanDuration = '1h' | '24h' | '7d' | '30d' | 'permanent';

interface UserBan {
  id: string;
  user_id: string;
  server_id: string | null;
  banned_by: string;
  banned_at: string;
  expires_at: string | null;
  reason: string;
  lifted_by: string | null;
  lifted_at: string | null;
  session_id: string | null;
  created_at: string;
  // Joined fields
  banned_username?: string;
  banned_display_name?: string;
  banned_by_username?: string;
  server_name?: string;
  ban_scope?: string;
}

/**
 * Calculate expiration date from duration
 */
function calculateExpiration(duration?: BanDuration): Date | null {
  if (!duration || duration === 'permanent') {
    return null;
  }

  const now = new Date();
  switch (duration) {
    case '1h':
      return new Date(now.getTime() + 60 * 60 * 1000);
    case '24h':
      return new Date(now.getTime() + 24 * 60 * 60 * 1000);
    case '7d':
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    case '30d':
      return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    default:
      return null;
  }
}

class BanService {
  /**
   * Ban a user globally
   */
  async banUser(options: {
    userId: string;
    bannedBy: string;
    reason: string;
    duration?: BanDuration;
    sessionId?: string;
  }): Promise<{ success: boolean; ban?: UserBan; error?: string }> {
    try {
      // Check if user is already banned
      const existingBan = await this.isUserBanned(options.userId);
      if (existingBan.banned) {
        return {
          success: false,
          error: 'User is already globally banned',
        };
      }

      // Calculate expiration
      const expiresAt = calculateExpiration(options.duration);

      // Create ban record (always global)
      const { data: ban, error } = await supabase
        .from('user_bans')
        .insert({
          user_id: options.userId,
          server_id: null,
          banned_by: options.bannedBy,
          reason: options.reason,
          expires_at: expiresAt?.toISOString() || null,
          session_id: options.sessionId || null,
        })
        .select('*')
        .single();

      if (error) {
        console.error('[BanService] Failed to create ban:', error);
        return { success: false, error: error.message };
      }

      console.log(
        `[BanService] User ${options.userId} banned globally by ${options.bannedBy}`
      );

      return { success: true, ban: ban as UserBan };
    } catch (error: any) {
      console.error('[BanService] Error banning user:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Lift (unban) a user
   */
  async unbanUser(banId: string, liftedBy: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { data, error } = await supabase
        .from('user_bans')
        .update({
          lifted_by: liftedBy,
          lifted_at: new Date().toISOString(),
        })
        .eq('id', banId)
        .is('lifted_at', null)
        .select('*')
        .single();

      if (error) {
        console.error('[BanService] Failed to lift ban:', error);
        return { success: false, error: error.message };
      }

      if (!data) {
        return { success: false, error: 'Ban not found or already lifted' };
      }

      console.log(`[BanService] Ban ${banId} lifted by ${liftedBy}`);
      return { success: true };
    } catch (error: any) {
      console.error('[BanService] Error lifting ban:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Check if a user is globally banned
   */
  async isUserBanned(userId: string): Promise<{ banned: boolean; ban?: UserBan }> {
    try {
      const { data: globalBan, error: globalError } = await supabase
        .from('user_bans')
        .select('*')
        .eq('user_id', userId)
        .is('server_id', null)
        .is('lifted_at', null)
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
        .limit(1)
        .maybeSingle();

      if (globalError) {
        console.error('[BanService] Error checking global ban:', globalError);
      }

      if (globalBan) {
        return { banned: true, ban: globalBan as UserBan };
      }

      return { banned: false };
    } catch (error: any) {
      console.error('[BanService] Error checking ban status:', error);
      return { banned: false };
    }
  }

  /**
   * Get all bans for a user
   */
  async getUserBans(userId: string): Promise<UserBan[]> {
    try {
      const { data, error } = await supabase
        .from('user_bans')
        .select(`
          *,
          banned_user:users!user_id(display_name, username, email),
          banned_by_user:users!banned_by(username, display_name),
          lifted_by_user:users!lifted_by(username, display_name),
          server:servers(name)
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[BanService] Error getting user bans:', error);
        return [];
      }

      // Transform to include joined fields
      return (data || []).map((ban: any) => ({
        ...ban,
        banned_username: ban.banned_user?.username || ban.banned_user?.display_name,
        banned_display_name: ban.banned_user?.display_name,
        banned_by_username: ban.banned_by_user?.username,
        server_name: ban.server?.name,
        ban_scope: ban.server_id ? 'Server' : 'Global',
      }));
    } catch (error: any) {
      console.error('[BanService] Error getting user bans:', error);
      return [];
    }
  }

  /**
   * Get all active bans
   */
  async getActiveBans(): Promise<UserBan[]> {
    try {
      const { data, error } = await supabase
        .from('user_bans')
        .select(`
          *,
          banned_user:users!user_id(display_name, username, email),
          banned_by_user:users!banned_by(username, display_name),
          server:servers(name)
        `)
        .is('lifted_at', null)
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
        .order('banned_at', { ascending: false });

      if (error) {
        console.error('[BanService] Error getting active bans:', error);
        return [];
      }

      // Transform to include joined fields
      return (data || []).map((ban: any) => ({
        ...ban,
        // Keep user info under 'users' for frontend compatibility
        users: {
          display_name: ban.banned_user?.display_name,
          username: ban.banned_user?.username,
          email: ban.banned_user?.email,
        },
        banned_username: ban.banned_user?.username || ban.banned_user?.display_name,
        banned_display_name: ban.banned_user?.display_name,
        banned_by_username: ban.banned_by_user?.username,
        server_name: ban.server?.name,
        servers: ban.server, // Keep server info under 'servers' for frontend compatibility
        ban_scope: ban.server_id ? 'Server' : 'Global',
      }));
    } catch (error: any) {
      console.error('[BanService] Error getting active bans:', error);
      return [];
    }
  }

  /**
   * Get recent bans (both active and lifted) for activity feed
   */
  async getRecentBans(limit = 10): Promise<UserBan[]> {
    try {
      const { data, error } = await supabase
        .from('user_bans')
        .select(`
          *,
          banned_user:users!user_id(display_name, username, email),
          banned_by_user:users!banned_by(username, display_name),
          lifted_by_user:users!lifted_by(username, display_name),
          server:servers(name)
        `)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('[BanService] Error getting recent bans:', error);
        return [];
      }

      return (data || []).map((ban: any) => ({
        ...ban,
        users: {
          display_name: ban.banned_user?.display_name,
          username: ban.banned_user?.username,
          email: ban.banned_user?.email,
        },
        banned_username: ban.banned_user?.username || ban.banned_user?.display_name,
        banned_display_name: ban.banned_user?.display_name,
        banned_by_username: ban.banned_by_user?.username,
        lifted_by_username: ban.lifted_by_user?.username || ban.lifted_by_user?.display_name,
        server_name: ban.server?.name,
        servers: ban.server,
        ban_scope: ban.server_id ? 'Server' : 'Global',
      }));
    } catch (error: any) {
      console.error('[BanService] Error getting recent bans:', error);
      return [];
    }
  }

  /**
   * Get a specific ban by ID
   */
  async getBan(banId: string): Promise<UserBan | null> {
    try {
      const { data, error } = await supabase
        .from('user_bans')
        .select(`
          *,
          banned_user:users!user_id(display_name, username, email),
          banned_by_user:users!banned_by(username, display_name),
          lifted_by_user:users!lifted_by(username, display_name),
          server:servers(name)
        `)
        .eq('id', banId)
        .single();

      if (error) {
        console.error('[BanService] Error getting ban:', error);
        return null;
      }

      return {
        ...data,
        banned_username: data.banned_user?.username || data.banned_user?.display_name,
        banned_display_name: data.banned_user?.display_name,
        banned_by_username: data.banned_by_user?.username,
        server_name: data.server?.name,
        ban_scope: data.server_id ? 'Server' : 'Global',
      } as UserBan;
    } catch (error: any) {
      console.error('[BanService] Error getting ban:', error);
      return null;
    }
  }

  /**
   * Get ban statistics
   */
  async getBanStats(): Promise<{
    totalActive: number;
    globalBans: number;
    expiringWithin24h: number;
  }> {
    try {
      const now = new Date();
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      const { data, error } = await supabase
        .from('user_bans')
        .select('id, server_id, expires_at')
        .is('lifted_at', null)
        .or(`expires_at.is.null,expires_at.gt.${now.toISOString()}`);

      if (error) {
        console.error('[BanService] Error getting ban stats:', error);
        return { totalActive: 0, globalBans: 0, expiringWithin24h: 0 };
      }

      const activeBans = data || [];
      const globalBans = activeBans.filter((b) => !b.server_id);
      const expiringWithin24h = activeBans.filter(
        (b) => b.expires_at && new Date(b.expires_at) <= tomorrow
      );

      return {
        totalActive: activeBans.length,
        globalBans: globalBans.length,
        expiringWithin24h: expiringWithin24h.length,
      };
    } catch (error: any) {
      console.error('[BanService] Error getting ban stats:', error);
      return { totalActive: 0, globalBans: 0, expiringWithin24h: 0 };
    }
  }
}

export const banService = new BanService();
