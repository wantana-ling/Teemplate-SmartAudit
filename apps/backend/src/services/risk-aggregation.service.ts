import { supabase } from '../config/supabase.js';
import { ruleLoaderService } from './rule-loader.service.js';

interface UserRiskProfile {
  user_id: string;
  total_sessions: number;
  high_risk_sessions: number;
  critical_sessions: number;
  privilege_escalation_count: number;
  data_exfiltration_count: number;
  persistence_count: number;
  lateral_movement_count: number;
  credential_access_count: number;
  defense_evasion_count: number;
  risk_score_7d: number;
  risk_score_30d: number;
  last_session_at: string | null;
  last_high_risk_at: string | null;
  username?: string;
  display_name?: string;
}

interface ServerRiskProfile {
  server_id: string;
  total_sessions: number;
  high_risk_sessions: number;
  unique_users: number;
  risk_score_7d: number;
  risk_score_30d: number;
  last_session_at: string | null;
  server_name?: string;
}

class RiskAggregationService {
  /**
   * Recalculate risk profile for a specific user
   * This calls the database function that performs the calculation
   */
  async recalculateUserProfile(userId: string): Promise<void> {
    try {
      const { error } = await supabase.rpc('recalculate_user_risk_profile', {
        p_user_id: userId,
      });

      if (error) {
        console.error('[RiskAggregation] Failed to recalculate user profile:', error);
        throw new Error(error.message);
      }

      console.log(`[RiskAggregation] Recalculated profile for user ${userId}`);
    } catch (error: any) {
      console.error('[RiskAggregation] Error recalculating user profile:', error);
      throw error;
    }
  }

  /**
   * Recalculate risk profile for a specific server
   */
  async recalculateServerProfile(serverId: string): Promise<void> {
    try {
      const { error } = await supabase.rpc('recalculate_server_risk_profile', {
        p_server_id: serverId,
      });

      if (error) {
        console.error('[RiskAggregation] Failed to recalculate server profile:', error);
        throw new Error(error.message);
      }

      console.log(`[RiskAggregation] Recalculated profile for server ${serverId}`);
    } catch (error: any) {
      console.error('[RiskAggregation] Error recalculating server profile:', error);
      throw error;
    }
  }

  /**
   * Get risk profile for a user
   */
  async getUserRiskProfile(userId: string): Promise<UserRiskProfile | null> {
    try {
      const { data, error } = await supabase
        .from('user_risk_profiles')
        .select(`
          *,
          user:users!user_id(username, display_name)
        `)
        .eq('user_id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No profile exists yet - try to create one
          await this.recalculateUserProfile(userId);
          return this.getUserRiskProfile(userId);
        }
        console.error('[RiskAggregation] Error getting user profile:', error);
        return null;
      }

      return {
        ...data,
        username: data.user?.username,
        display_name: data.user?.display_name,
      } as UserRiskProfile;
    } catch (error: any) {
      console.error('[RiskAggregation] Error getting user profile:', error);
      return null;
    }
  }

  /**
   * Get risk profile for a server
   */
  async getServerRiskProfile(serverId: string): Promise<ServerRiskProfile | null> {
    try {
      const { data, error } = await supabase
        .from('server_risk_profiles')
        .select(`
          *,
          server:servers!server_id(name)
        `)
        .eq('server_id', serverId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No profile exists yet - try to create one
          await this.recalculateServerProfile(serverId);
          return this.getServerRiskProfile(serverId);
        }
        console.error('[RiskAggregation] Error getting server profile:', error);
        return null;
      }

      return {
        ...data,
        server_name: data.server?.name,
      } as ServerRiskProfile;
    } catch (error: any) {
      console.error('[RiskAggregation] Error getting server profile:', error);
      return null;
    }
  }

  /**
   * Get high risk users - queries sessions directly for accurate data
   */
  async getHighRiskUsers(limit: number = 10): Promise<UserRiskProfile[]> {
    try {
      // Query sessions directly to get users with high-risk activity
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data: sessions, error } = await supabase
        .from('sessions')
        .select(`
          user_id,
          risk_level,
          privilege_escalation,
          data_exfiltration,
          persistence,
          lateral_movement,
          credential_access,
          defense_evasion,
          started_at,
          users:user_id(id, username, display_name, email, role)
        `)
        .eq('status', 'disconnected')
        .in('risk_level', ['critical', 'high', 'medium'])
        .gte('started_at', sevenDaysAgo.toISOString());

      if (error) {
        console.error('[RiskAggregation] Error getting high risk users:', error);
        return [];
      }

      // Aggregate by user
      const userMap = new Map<string, any>();
      for (const session of sessions || []) {
        if (!session.user_id) continue;

        const existing = userMap.get(session.user_id) || {
          user_id: session.user_id,
          total_sessions: 0,
          high_risk_sessions: 0,
          critical_sessions: 0,
          privilege_escalation_count: 0,
          data_exfiltration_count: 0,
          persistence_count: 0,
          lateral_movement_count: 0,
          credential_access_count: 0,
          defense_evasion_count: 0,
          risk_score_7d: 0,
          risk_score_30d: 0,
          last_session_at: null,
          users: session.users,
        };

        existing.total_sessions++;
        if (session.risk_level === 'high' || session.risk_level === 'critical') {
          existing.high_risk_sessions++;
        }
        if (session.risk_level === 'critical') existing.critical_sessions++;
        if (session.privilege_escalation) existing.privilege_escalation_count++;
        if (session.data_exfiltration) existing.data_exfiltration_count++;
        if (session.persistence) existing.persistence_count++;
        if (session.lateral_movement) existing.lateral_movement_count++;
        if (session.credential_access) existing.credential_access_count++;
        if (session.defense_evasion) existing.defense_evasion_count++;

        // Accumulate risk score: severity + behavioral flags (from scoring config)
        const { sessionWeights, perBehavioralFlag } = ruleLoaderService.getRules().scoring.userRiskScoring;
        existing.risk_score_7d += sessionWeights[session.risk_level as keyof typeof sessionWeights] ?? 0;
        const flagCount = [session.privilege_escalation, session.data_exfiltration, session.persistence, session.lateral_movement, session.credential_access, session.defense_evasion].filter(Boolean).length;
        existing.risk_score_7d += flagCount * perBehavioralFlag;
        existing.last_session_at = session.started_at;

        userMap.set(session.user_id, existing);
      }

      // Cap at configured maximum, sort by risk score, and return top N
      const { cap } = ruleLoaderService.getRules().scoring.userRiskScoring;
      const users = Array.from(userMap.values());
      for (const u of users) u.risk_score_7d = Math.min(u.risk_score_7d, cap);
      return users
        .sort((a, b) => b.risk_score_7d - a.risk_score_7d)
        .slice(0, limit);
    } catch (error: any) {
      console.error('[RiskAggregation] Error getting high risk users:', error);
      return [];
    }
  }

  /**
   * Get high risk servers - queries sessions directly for accurate data
   */
  async getHighRiskServers(limit: number = 10): Promise<ServerRiskProfile[]> {
    try {
      // Query sessions directly to get servers with high-risk activity
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data: sessions, error } = await supabase
        .from('sessions')
        .select(`
          server_id,
          user_id,
          risk_level,
          started_at,
          servers:server_id(id, name, host, protocol, enabled)
        `)
        .eq('status', 'disconnected')
        .in('risk_level', ['critical', 'high', 'medium'])
        .gte('started_at', sevenDaysAgo.toISOString());

      if (error) {
        console.error('[RiskAggregation] Error getting high risk servers:', error);
        return [];
      }

      // Aggregate by server
      const serverMap = new Map<string, any>();
      for (const session of sessions || []) {
        if (!session.server_id) continue;

        const existing = serverMap.get(session.server_id) || {
          server_id: session.server_id,
          total_sessions: 0,
          high_risk_sessions: 0,
          critical_sessions: 0,
          unique_users: new Set(),
          risk_score_7d: 0,
          risk_score_30d: 0,
          last_session_at: null,
          servers: session.servers,
        };

        existing.total_sessions++;
        if (session.risk_level === 'high' || session.risk_level === 'critical') {
          existing.high_risk_sessions++;
        }
        if (session.risk_level === 'critical') existing.critical_sessions++;
        if (session.user_id) existing.unique_users.add(session.user_id);

        // Accumulate risk score based on session severity (from scoring config)
        const { sessionWeights } = ruleLoaderService.getRules().scoring.userRiskScoring;
        existing.risk_score_7d += sessionWeights[session.risk_level as keyof typeof sessionWeights] ?? 0;
        existing.last_session_at = session.started_at;

        serverMap.set(session.server_id, existing);
      }

      // Cap at configured maximum, sort by risk score, and return top N
      const { cap } = ruleLoaderService.getRules().scoring.userRiskScoring;
      const servers = Array.from(serverMap.values())
        .map((s) => ({
          ...s,
          risk_score_7d: Math.min(s.risk_score_7d, cap),
          unique_users: s.unique_users.size,
        }))
        .sort((a, b) => b.risk_score_7d - a.risk_score_7d)
        .slice(0, limit);

      return servers;
    } catch (error: any) {
      console.error('[RiskAggregation] Error getting high risk servers:', error);
      return [];
    }
  }

  /**
   * Get risk trend for a user over time
   */
  async getUserRiskTrend(
    userId: string,
    days: number = 30
  ): Promise<{ date: string; riskScore: number; sessionCount: number }[]> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const { data, error } = await supabase
        .from('sessions')
        .select('started_at, risk_level')
        .eq('user_id', userId)
        .eq('status', 'disconnected')
        .gte('started_at', startDate.toISOString())
        .order('started_at', { ascending: true });

      if (error) {
        console.error('[RiskAggregation] Error getting user risk trend:', error);
        return [];
      }

      // Group by date and calculate daily risk scores
      const dailyData = new Map<string, { total: number; count: number }>();

      for (const session of data || []) {
        const date = new Date(session.started_at).toISOString().split('T')[0];
        const riskScore =
          session.risk_level === 'critical'
            ? 100
            : session.risk_level === 'high'
              ? 75
              : session.risk_level === 'medium'
                ? 40
                : 10;

        const existing = dailyData.get(date) || { total: 0, count: 0 };
        existing.total += riskScore;
        existing.count += 1;
        dailyData.set(date, existing);
      }

      return Array.from(dailyData.entries()).map(([date, { total, count }]) => ({
        date,
        riskScore: Math.round(total / count),
        sessionCount: count,
      }));
    } catch (error: any) {
      console.error('[RiskAggregation] Error getting user risk trend:', error);
      return [];
    }
  }

  /**
   * Get overall risk statistics
   */
  async getOverallRiskStats(): Promise<{
    totalUsers: number;
    highRiskUsers: number;
    criticalUsers: number;
    totalSessions7d: number;
    highRiskSessions7d: number;
    averageRiskScore7d: number;
  }> {
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      // Get user risk stats
      const { data: userStats, error: userError } = await supabase
        .from('user_risk_profiles')
        .select('risk_score_7d');

      if (userError) {
        console.error('[RiskAggregation] Error getting user stats:', userError);
      }

      // Get session stats for last 7 days
      const { data: sessionStats, error: sessionError } = await supabase
        .from('sessions')
        .select('risk_level')
        .eq('status', 'disconnected')
        .gte('started_at', sevenDaysAgo.toISOString());

      if (sessionError) {
        console.error('[RiskAggregation] Error getting session stats:', sessionError);
      }

      const users = userStats || [];
      const sessions = sessionStats || [];

      const highRiskUsers = users.filter((u) => u.risk_score_7d >= 50).length;
      const criticalUsers = users.filter((u) => u.risk_score_7d >= 75).length;
      const averageRiskScore =
        users.length > 0
          ? users.reduce((sum, u) => sum + (u.risk_score_7d || 0), 0) / users.length
          : 0;

      const highRiskSessions = sessions.filter(
        (s) => s.risk_level === 'high' || s.risk_level === 'critical'
      ).length;

      return {
        totalUsers: users.length,
        highRiskUsers,
        criticalUsers,
        totalSessions7d: sessions.length,
        highRiskSessions7d: highRiskSessions,
        averageRiskScore7d: Math.round(averageRiskScore * 100) / 100,
      };
    } catch (error: any) {
      console.error('[RiskAggregation] Error getting overall stats:', error);
      return {
        totalUsers: 0,
        highRiskUsers: 0,
        criticalUsers: 0,
        totalSessions7d: 0,
        highRiskSessions7d: 0,
        averageRiskScore7d: 0,
      };
    }
  }

  /**
   * Get behavioral pattern summary - queries sessions directly for accurate counts
   */
  async getBehavioralPatternSummary(): Promise<{
    privilege_escalation: number;
    data_exfiltration: number;
    persistence: number;
    lateral_movement: number;
    credential_access: number;
    defense_evasion: number;
  }> {
    try {
      // Query sessions directly for behavioral flags - more accurate than aggregated profiles
      const { data, error } = await supabase
        .from('sessions')
        .select(`
          privilege_escalation,
          data_exfiltration,
          persistence,
          lateral_movement,
          credential_access,
          defense_evasion
        `)
        .eq('status', 'disconnected');

      if (error) {
        console.error('[RiskAggregation] Error getting behavioral summary:', error);
        return {
          privilege_escalation: 0,
          data_exfiltration: 0,
          persistence: 0,
          lateral_movement: 0,
          credential_access: 0,
          defense_evasion: 0,
        };
      }

      const sessions = data || [];

      return {
        privilege_escalation: sessions.filter((s) => s.privilege_escalation === true).length,
        data_exfiltration: sessions.filter((s) => s.data_exfiltration === true).length,
        persistence: sessions.filter((s) => s.persistence === true).length,
        lateral_movement: sessions.filter((s) => s.lateral_movement === true).length,
        credential_access: sessions.filter((s) => s.credential_access === true).length,
        defense_evasion: sessions.filter((s) => s.defense_evasion === true).length,
      };
    } catch (error: any) {
      console.error('[RiskAggregation] Error getting behavioral summary:', error);
      return {
        privilege_escalation: 0,
        data_exfiltration: 0,
        persistence: 0,
        lateral_movement: 0,
        credential_access: 0,
        defense_evasion: 0,
      };
    }
  }
}

export const riskAggregationService = new RiskAggregationService();
