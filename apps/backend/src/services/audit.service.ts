import { supabase } from '../config/supabase.js';

export type AuditAction =
  // Authentication
  | 'login_success'
  | 'login_failed'
  | 'logout'
  | 'password_changed'
  // Session Management
  | 'session_started'
  | 'session_ended'
  | 'session_terminated'
  | 'session_reviewed'
  | 'session_unreviewed'
  | 'session_reanalyzed'
  // User Management
  | 'user_created'
  | 'user_updated'
  | 'user_deleted'
  | 'user_enabled'
  | 'user_disabled'
  // Server Management
  | 'server_created'
  | 'server_updated'
  | 'server_deleted'
  | 'server_enabled'
  | 'server_disabled'
  // Access Control
  | 'access_granted'
  | 'access_revoked'
  | 'user_banned'
  | 'user_unbanned'
  // Group Management
  | 'group_created'
  | 'group_updated'
  | 'group_deleted'
  | 'group_member_added'
  | 'group_member_removed'
  // Risk & Alerts
  | 'risk_alert_acknowledged'
  | 'risk_alert_created'
  // Settings
  | 'settings_updated'
  // Tags
  | 'tag_added'
  | 'tag_removed';

export type ResourceType =
  | 'user'
  | 'server'
  | 'session'
  | 'group'
  | 'ban'
  | 'access'
  | 'alert'
  | 'settings'
  | 'auth';

interface AuditLogEntry {
  actorId?: string;        // User who performed the action (null for system actions)
  actorName?: string;      // Display name for the actor
  action: AuditAction;
  resourceType: ResourceType;
  resourceId?: string;     // ID of the affected resource
  resourceName?: string;   // Human-readable name of the resource
  details?: Record<string, any>;
  ipAddress?: string;
}

class AuditService {
  /**
   * Log an audit event
   */
  async log(entry: AuditLogEntry): Promise<void> {
    try {
      const { error } = await supabase.from('audit_log').insert({
        actor_id: entry.actorId || null,
        actor_name: entry.actorName || null,
        action: entry.action,
        resource_type: entry.resourceType,
        resource_id: entry.resourceId || null,
        resource_name: entry.resourceName || null,
        details: entry.details || null,
        ip_address: entry.ipAddress || null,
        created_at: new Date().toISOString(),
      });

      if (error) {
        console.error('[Audit] Failed to log audit entry:', error.message);
        // Don't throw - audit logging should not break the main operation
      } else {
        console.log(`[Audit] ${entry.action} - ${entry.resourceType}${entry.resourceId ? `:${entry.resourceId.slice(0, 8)}` : ''}`);
      }
    } catch (err) {
      console.error('[Audit] Error logging audit entry:', err);
      // Don't throw - audit logging should not break the main operation
    }
  }

  /**
   * Helper to extract IP from request
   */
  getIpFromRequest(req: any): string {
    return req.ip ||
           req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
           req.connection?.remoteAddress ||
           'unknown';
  }

  /**
   * Helper to get user info from request (set by auth middleware)
   * Uses username as it cannot be changed (more reliable for audit trail)
   */
  getActorFromRequest(req: any): { actorId?: string; actorName?: string } {
    const user = (req as any).user;
    if (!user) return {};
    return {
      actorId: user.userId,
      actorName: user.username,
    };
  }

  // ============ Convenience Methods ============

  // Authentication
  async logLogin(req: any, userId: string, username: string, success: boolean): Promise<void> {
    await this.log({
      actorId: success ? userId : undefined,
      actorName: username,
      action: success ? 'login_success' : 'login_failed',
      resourceType: 'auth',
      details: { username },
      ipAddress: this.getIpFromRequest(req),
    });
  }

  async logLogout(req: any): Promise<void> {
    const actor = this.getActorFromRequest(req);
    await this.log({
      ...actor,
      action: 'logout',
      resourceType: 'auth',
      ipAddress: this.getIpFromRequest(req),
    });
  }

  async logPasswordChange(req: any): Promise<void> {
    const actor = this.getActorFromRequest(req);
    await this.log({
      ...actor,
      action: 'password_changed',
      resourceType: 'auth',
      resourceId: actor.actorId,
      ipAddress: this.getIpFromRequest(req),
    });
  }

  // Session Management
  async logSessionStart(req: any, sessionId: string, serverName: string, userName: string): Promise<void> {
    await this.log({
      actorName: userName,
      action: 'session_started',
      resourceType: 'session',
      resourceId: sessionId,
      resourceName: serverName,
      details: { server: serverName, user: userName },
      ipAddress: this.getIpFromRequest(req),
    });
  }

  async logSessionEnd(sessionId: string, serverName: string, userName: string, reason?: string): Promise<void> {
    await this.log({
      actorName: userName,
      action: 'session_ended',
      resourceType: 'session',
      resourceId: sessionId,
      resourceName: serverName,
      details: { server: serverName, user: userName, reason },
    });
  }

  async logSessionTerminated(req: any, sessionId: string, serverName?: string): Promise<void> {
    const actor = this.getActorFromRequest(req);
    await this.log({
      ...actor,
      action: 'session_terminated',
      resourceType: 'session',
      resourceId: sessionId,
      resourceName: serverName,
      ipAddress: this.getIpFromRequest(req),
    });
  }

  async logSessionReview(req: any, sessionId: string, reviewed: boolean): Promise<void> {
    const actor = this.getActorFromRequest(req);
    await this.log({
      ...actor,
      action: reviewed ? 'session_reviewed' : 'session_unreviewed',
      resourceType: 'session',
      resourceId: sessionId,
      ipAddress: this.getIpFromRequest(req),
    });
  }

  // User Management
  async logUserAction(req: any, action: 'user_created' | 'user_updated' | 'user_deleted' | 'user_enabled' | 'user_disabled', userId: string, userName?: string, details?: Record<string, any>): Promise<void> {
    const actor = this.getActorFromRequest(req);
    await this.log({
      ...actor,
      action,
      resourceType: 'user',
      resourceId: userId,
      resourceName: userName,
      details,
      ipAddress: this.getIpFromRequest(req),
    });
  }

  // Server Management
  async logServerAction(req: any, action: 'server_created' | 'server_updated' | 'server_deleted' | 'server_enabled' | 'server_disabled', serverId: string, serverName?: string, details?: Record<string, any>): Promise<void> {
    const actor = this.getActorFromRequest(req);
    await this.log({
      ...actor,
      action,
      resourceType: 'server',
      resourceId: serverId,
      resourceName: serverName,
      details,
      ipAddress: this.getIpFromRequest(req),
    });
  }

  // Access Control
  async logAccessGranted(req: any, serverId: string, serverName: string, targetType: 'user' | 'group', targetId: string, targetName?: string): Promise<void> {
    const actor = this.getActorFromRequest(req);
    await this.log({
      ...actor,
      action: 'access_granted',
      resourceType: 'access',
      resourceId: serverId,
      resourceName: serverName,
      details: { targetType, targetId, targetName },
      ipAddress: this.getIpFromRequest(req),
    });
  }

  async logAccessRevoked(req: any, serverId: string, serverName?: string, targetType?: string, targetId?: string): Promise<void> {
    const actor = this.getActorFromRequest(req);
    await this.log({
      ...actor,
      action: 'access_revoked',
      resourceType: 'access',
      resourceId: serverId,
      resourceName: serverName,
      details: { targetType, targetId },
      ipAddress: this.getIpFromRequest(req),
    });
  }

  async logBan(req: any, action: 'user_banned' | 'user_unbanned', banId: string, userId: string, userName?: string, reason?: string, duration?: string): Promise<void> {
    const actor = this.getActorFromRequest(req);
    await this.log({
      ...actor,
      action,
      resourceType: 'ban',
      resourceId: banId,
      resourceName: userName,
      details: { userId, reason, duration },
      ipAddress: this.getIpFromRequest(req),
    });
  }

  // Group Management
  async logGroupAction(req: any, action: 'group_created' | 'group_updated' | 'group_deleted', groupId: string, groupName?: string, details?: Record<string, any>): Promise<void> {
    const actor = this.getActorFromRequest(req);
    await this.log({
      ...actor,
      action,
      resourceType: 'group',
      resourceId: groupId,
      resourceName: groupName,
      details,
      ipAddress: this.getIpFromRequest(req),
    });
  }

  async logGroupMember(req: any, action: 'group_member_added' | 'group_member_removed', groupId: string, groupName: string, userId: string, userName?: string): Promise<void> {
    const actor = this.getActorFromRequest(req);
    await this.log({
      ...actor,
      action,
      resourceType: 'group',
      resourceId: groupId,
      resourceName: groupName,
      details: { memberId: userId, memberName: userName },
      ipAddress: this.getIpFromRequest(req),
    });
  }

  // Risk & Alerts
  async logAlertAcknowledged(req: any, alertId: string, sessionId?: string): Promise<void> {
    const actor = this.getActorFromRequest(req);
    await this.log({
      ...actor,
      action: 'risk_alert_acknowledged',
      resourceType: 'alert',
      resourceId: alertId,
      details: { sessionId },
      ipAddress: this.getIpFromRequest(req),
    });
  }

  // Settings
  async logSettingsUpdated(req: any, changes: Record<string, any>): Promise<void> {
    const actor = this.getActorFromRequest(req);
    await this.log({
      ...actor,
      action: 'settings_updated',
      resourceType: 'settings',
      details: changes,
      ipAddress: this.getIpFromRequest(req),
    });
  }

  // Tags
  async logTagAction(req: any, action: 'tag_added' | 'tag_removed', sessionId: string, tag: string): Promise<void> {
    const actor = this.getActorFromRequest(req);
    await this.log({
      ...actor,
      action,
      resourceType: 'session',
      resourceId: sessionId,
      details: { tag },
      ipAddress: this.getIpFromRequest(req),
    });
  }
}

export const auditService = new AuditService();
