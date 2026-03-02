import { supabase } from '../config/supabase.js';

export interface Group {
  id: string;
  name: string;
  description: string | null;
  color: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  member_count?: number;
  server_count?: number;
}

export interface GroupMember {
  id: string;
  user_id: string;
  group_id: string;
  assigned_at: string;
  assigned_by: string | null;
}

class GroupsService {
  /**
   * Get all groups
   */
  async getGroups(): Promise<Group[]> {
    const { data, error } = await supabase
      .from('groups')
      .select('*')
      .order('name');

    if (error) {
      throw new Error(error.message);
    }

    // Get member and server counts for all groups in parallel
    const groups = data || [];
    await Promise.all(
      groups.map(async (group) => {
        const [memberResult, serverResult] = await Promise.all([
          supabase
            .from('users')
            .select('*', { count: 'exact', head: true })
            .eq('department', group.name),
          supabase
            .from('server_access')
            .select('*', { count: 'exact', head: true })
            .eq('group_id', group.id),
        ]);
        group.member_count = memberResult.count || 0;
        group.server_count = serverResult.count || 0;
      })
    );

    return groups;
  }

  /**
   * Get group by ID
   */
  async getGroupById(groupId: string): Promise<Group | null> {
    const { data, error } = await supabase
      .from('groups')
      .select('*')
      .eq('id', groupId)
      .single();

    if (error || !data) {
      return null;
    }

    // Get member count
    const { count } = await supabase
      .from('user_groups')
      .select('*', { count: 'exact', head: true })
      .eq('group_id', groupId);

    return {
      ...data,
      member_count: count || 0,
    };
  }

  /**
   * Create a new group
   */
  async createGroup(
    name: string,
    description: string | null,
    color: string,
    createdBy: string
  ): Promise<Group> {
    const { data, error } = await supabase
      .from('groups')
      .insert({
        name,
        description,
        color,
        created_by: createdBy,
      })
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return { ...data, member_count: 0 };
  }

  /**
   * Update a group
   */
  async updateGroup(
    groupId: string,
    updates: Partial<{ name: string; description: string; color: string }>
  ): Promise<Group> {
    const updateData: any = { updated_at: new Date().toISOString() };
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.color !== undefined) updateData.color = updates.color;

    const { data, error } = await supabase
      .from('groups')
      .update(updateData)
      .eq('id', groupId)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  /**
   * Delete a group
   */
  async deleteGroup(groupId: string): Promise<void> {
    const { error } = await supabase
      .from('groups')
      .delete()
      .eq('id', groupId);

    if (error) {
      throw new Error(error.message);
    }
  }

  /**
   * Get members of a group
   */
  async getGroupMembers(groupId: string): Promise<any[]> {
    // Use explicit relationship hint because user_groups has multiple FK to users
    const { data, error } = await supabase
      .from('user_groups')
      .select(`
        id,
        assigned_at,
        assigned_by,
        user:users!user_id (
          id,
          username,
          display_name,
          email,
          role,
          enabled,
          avatar_color
        )
      `)
      .eq('group_id', groupId);

    if (error) {
      console.error('[GroupsService] getGroupMembers error:', error);
      throw new Error(error.message);
    }

    return (data || []).map((m: any) => ({
      id: m.id,
      assigned_at: m.assigned_at,
      assigned_by: m.assigned_by,
      user: m.user,
    }));
  }

  /**
   * Add user to group
   */
  async addMember(groupId: string, userId: string, assignedBy: string): Promise<void> {
    const { error } = await supabase
      .from('user_groups')
      .insert({
        group_id: groupId,
        user_id: userId,
        assigned_by: assignedBy,
      });

    if (error) {
      if (error.code === '23505') {
        throw new Error('User is already a member of this group');
      }
      throw new Error(error.message);
    }
  }

  /**
   * Remove user from group
   */
  async removeMember(groupId: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from('user_groups')
      .delete()
      .eq('group_id', groupId)
      .eq('user_id', userId);

    if (error) {
      throw new Error(error.message);
    }
  }

  /**
   * Get groups for a user
   */
  async getUserGroups(userId: string): Promise<Group[]> {
    const { data, error } = await supabase
      .from('user_groups')
      .select(`
        group:groups!group_id (
          id,
          name,
          description,
          color,
          created_at,
          updated_at
        )
      `)
      .eq('user_id', userId);

    if (error) {
      throw new Error(error.message);
    }

    return (data || []).map((m: any) => m.group);
  }

  /**
   * Set user's groups (replace all)
   */
  async setUserGroups(userId: string, groupIds: string[], assignedBy: string): Promise<void> {
    // Delete existing memberships
    await supabase
      .from('user_groups')
      .delete()
      .eq('user_id', userId);

    // Add new memberships
    if (groupIds.length > 0) {
      const { error } = await supabase
        .from('user_groups')
        .insert(
          groupIds.map((groupId) => ({
            user_id: userId,
            group_id: groupId,
            assigned_by: assignedBy,
          }))
        );

      if (error) {
        throw new Error(error.message);
      }
    }
  }
}

export const groupsService = new GroupsService();
