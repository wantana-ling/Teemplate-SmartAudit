import { supabase } from '../config/supabase.js';

export interface ServerAccess {
  id: string;
  server_id: string;
  user_id: string | null;
  group_id: string | null;
  granted_at: string;
  granted_by: string | null;
}

class ServerAccessService {
  /**
   * Get all access entries for a server
   */
  async getServerAccess(serverId: string): Promise<any[]> {
    // Use explicit relationship hints because server_access has multiple FK to users
    const { data, error } = await supabase
      .from('server_access')
      .select(`
        id,
        server_id,
        user_id,
        group_id,
        granted_at,
        granted_by,
        user:users!user_id (
          id,
          username,
          display_name,
          role,
          avatar_color
        ),
        group:groups!group_id (
          id,
          name,
          color
        )
      `)
      .eq('server_id', serverId);

    if (error) {
      console.error('[ServerAccessService] getServerAccess error:', error);
      throw new Error(error.message);
    }

    // Also get member counts for groups
    const result = await Promise.all((data || []).map(async (a: any) => {
      let groupWithCount = a.group;
      if (groupWithCount) {
        const { count } = await supabase
          .from('user_groups')
          .select('*', { count: 'exact', head: true })
          .eq('group_id', a.group_id);
        groupWithCount = { ...groupWithCount, member_count: count || 0 };
      }

      return {
        id: a.id,
        server_id: a.server_id,
        user_id: a.user_id,
        group_id: a.group_id,
        granted_at: a.granted_at,
        granted_by: a.granted_by,
        user: a.user || null,
        group: groupWithCount,
      };
    }));

    return result;
  }

  /**
   * Grant user access to server
   */
  async grantUserAccess(serverId: string, userId: string, grantedBy: string): Promise<void> {
    const { error } = await supabase
      .from('server_access')
      .insert({
        server_id: serverId,
        user_id: userId,
        granted_by: grantedBy,
      });

    if (error) {
      if (error.code === '23505') {
        throw new Error('User already has access to this server');
      }
      throw new Error(error.message);
    }
  }

  /**
   * Grant group access to server
   */
  async grantGroupAccess(serverId: string, groupId: string, grantedBy: string): Promise<void> {
    const { error } = await supabase
      .from('server_access')
      .insert({
        server_id: serverId,
        group_id: groupId,
        granted_by: grantedBy,
      });

    if (error) {
      if (error.code === '23505') {
        throw new Error('Group already has access to this server');
      }
      throw new Error(error.message);
    }
  }

  /**
   * Revoke access (user or group)
   */
  async revokeAccess(accessId: string): Promise<void> {
    const { error } = await supabase
      .from('server_access')
      .delete()
      .eq('id', accessId);

    if (error) {
      throw new Error(error.message);
    }
  }

  /**
   * Revoke user access from server
   */
  async revokeUserAccess(serverId: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from('server_access')
      .delete()
      .eq('server_id', serverId)
      .eq('user_id', userId);

    if (error) {
      throw new Error(error.message);
    }
  }

  /**
   * Revoke group access from server
   */
  async revokeGroupAccess(serverId: string, groupId: string): Promise<void> {
    const { error } = await supabase
      .from('server_access')
      .delete()
      .eq('server_id', serverId)
      .eq('group_id', groupId);

    if (error) {
      throw new Error(error.message);
    }
  }

  /**
   * Check if user has access to server (directly, via group, or via department match)
   */
  async userHasAccess(userId: string, serverId: string): Promise<boolean> {
    // Check department-based access first
    const { data: user } = await supabase
      .from('users')
      .select('department')
      .eq('id', userId)
      .single();

    if (user?.department) {
      const { data: server } = await supabase
        .from('servers')
        .select('department')
        .eq('id', serverId)
        .single();

      if (server?.department && Array.isArray(server.department) && server.department.includes(user.department)) {
        return true;
      }
    }

    // Check direct user access
    const { count: directCount } = await supabase
      .from('server_access')
      .select('*', { count: 'exact', head: true })
      .eq('server_id', serverId)
      .eq('user_id', userId);

    if ((directCount || 0) > 0) {
      return true;
    }

    // Check group access
    const { data: userGroups } = await supabase
      .from('user_groups')
      .select('group_id')
      .eq('user_id', userId);

    if (!userGroups || userGroups.length === 0) {
      return false;
    }

    const groupIds = userGroups.map((g: any) => g.group_id);

    const { count: groupCount } = await supabase
      .from('server_access')
      .select('*', { count: 'exact', head: true })
      .eq('server_id', serverId)
      .in('group_id', groupIds);

    return (groupCount || 0) > 0;
  }

  /**
   * Get all servers a user can access (direct, group, or department match)
   */
  async getUserAccessibleServers(userId: string): Promise<string[]> {
    const serverIds = new Set<string>();

    // 1. Department-based access: servers whose department matches user's department
    const { data: user } = await supabase
      .from('users')
      .select('department')
      .eq('id', userId)
      .single();

    if (user?.department) {
      const { data: deptServers } = await supabase
        .from('servers')
        .select('id')
        .contains('department', [user.department]);

      (deptServers || []).forEach((s: any) => serverIds.add(s.id));
    }

    // 2. Direct user access via server_access table
    const { data: directAccess } = await supabase
      .from('server_access')
      .select('server_id')
      .eq('user_id', userId);

    (directAccess || []).forEach((a: any) => serverIds.add(a.server_id));

    // 3. Group-based access via user_groups + server_access
    const { data: userGroups } = await supabase
      .from('user_groups')
      .select('group_id')
      .eq('user_id', userId);

    if (userGroups && userGroups.length > 0) {
      const groupIds = userGroups.map((g: any) => g.group_id);

      const { data: groupAccess } = await supabase
        .from('server_access')
        .select('server_id')
        .in('group_id', groupIds);

      (groupAccess || []).forEach((a: any) => serverIds.add(a.server_id));
    }

    return Array.from(serverIds);
  }

  /**
   * Get all servers assigned to a group
   */
  async getGroupServers(groupId: string): Promise<any[]> {
    const { data, error } = await supabase
      .from('server_access')
      .select(`
        id,
        server_id,
        group_id,
        granted_at,
        server:servers!server_id (
          id,
          name,
          host,
          port,
          protocol,
          enabled,
          description
        )
      `)
      .eq('group_id', groupId);

    if (error) {
      console.error('[ServerAccessService] getGroupServers error:', error);
      throw new Error(error.message);
    }

    return (data || []).map((a: any) => ({
      id: a.id,
      server_id: a.server_id,
      group_id: a.group_id,
      granted_at: a.granted_at,
      server: a.server,
    }));
  }

  /**
   * Get all users who can access a server
   */
  async getServerAccessibleUsers(serverId: string): Promise<string[]> {
    // Get directly accessible users
    const { data: directAccess } = await supabase
      .from('server_access')
      .select('user_id')
      .eq('server_id', serverId)
      .not('user_id', 'is', null);

    const userIds = new Set<string>(
      (directAccess || []).filter((a: any) => a.user_id).map((a: any) => a.user_id)
    );

    // Get users via group access
    const { data: groupAccess } = await supabase
      .from('server_access')
      .select('group_id')
      .eq('server_id', serverId)
      .not('group_id', 'is', null);

    if (groupAccess && groupAccess.length > 0) {
      const groupIds = groupAccess.map((a: any) => a.group_id);

      const { data: groupMembers } = await supabase
        .from('user_groups')
        .select('user_id')
        .in('group_id', groupIds);

      (groupMembers || []).forEach((m: any) => userIds.add(m.user_id));
    }

    return Array.from(userIds);
  }
}

export const serverAccessService = new ServerAccessService();
