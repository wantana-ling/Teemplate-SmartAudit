-- ============================================================================
-- 008: Views and Table/Column Comments
-- ============================================================================

-- Active sessions view (LEFT JOIN for nullable server_id from 017)
CREATE OR REPLACE VIEW public.active_sessions AS
SELECT
  s.*,
  COALESCE(srv.name, s.server_name) as server_name,
  COALESCE(srv.host, s.server_host) as server_host,
  COALESCE(srv.protocol, s.server_protocol) as server_protocol
FROM public.sessions s
LEFT JOIN public.servers srv ON s.server_id = srv.id
WHERE s.status = 'active'
ORDER BY s.started_at DESC;

GRANT SELECT ON public.active_sessions TO authenticated;
GRANT SELECT ON public.active_sessions TO service_role;

-- Session statistics view
CREATE OR REPLACE VIEW public.session_statistics AS
SELECT
  COUNT(*) as total_sessions,
  COUNT(*) FILTER (WHERE status = 'active') as active_sessions,
  COUNT(*) FILTER (WHERE started_at > NOW() - INTERVAL '24 hours') as sessions_today,
  COUNT(*) FILTER (WHERE risk_level = 'high' OR risk_level = 'critical') as high_risk_sessions,
  AVG(duration_seconds) FILTER (WHERE duration_seconds IS NOT NULL) as avg_duration_seconds
FROM public.sessions;

-- Active bans view (from 012)
CREATE OR REPLACE VIEW active_bans AS
SELECT
  ub.*,
  u.username AS banned_username,
  u.display_name AS banned_display_name,
  banner.username AS banned_by_username,
  s.name AS server_name,
  CASE WHEN ub.server_id IS NULL THEN 'Global' ELSE 'Server' END AS ban_scope
FROM user_bans ub
JOIN users u ON ub.user_id = u.id
JOIN users banner ON ub.banned_by = banner.id
LEFT JOIN servers s ON ub.server_id = s.id
WHERE ub.lifted_at IS NULL
  AND (ub.expires_at IS NULL OR ub.expires_at > NOW())
ORDER BY ub.banned_at DESC;

-- Users with permissions view (from 014)
CREATE OR REPLACE VIEW users_with_permissions AS
SELECT
  u.id,
  u.username,
  u.display_name,
  u.email,
  u.role,
  u.enabled,
  u.avatar_color,
  u.created_at,
  u.last_login_at,
  rp.permissions,
  rp.description AS role_description
FROM users u
LEFT JOIN role_permissions rp ON u.role = rp.role;

-- ============================================================================
-- Table Comments
-- ============================================================================
COMMENT ON TABLE public.users IS 'All user accounts — admins, auditors, security, and clients';
COMMENT ON TABLE public.servers IS 'Remote server configurations available for connection';
COMMENT ON TABLE public.sessions IS 'Audit sessions with recordings, analysis, and behavioral flags';
COMMENT ON TABLE public.video_export_jobs IS 'On-demand MP4 generation jobs - videos generated temporarily and streamed to user, not stored in Supabase';
COMMENT ON TABLE public.audit_log IS 'Immutable audit trail for compliance (SOX, HIPAA, PCI-DSS). Records all administrative and security-relevant actions.';
COMMENT ON TABLE public.role_permissions IS 'Permission definitions for each role';
COMMENT ON TABLE public.user_bans IS 'User bans - server-specific or global';
COMMENT ON TABLE public.user_risk_profiles IS 'Aggregated risk data for each user';
COMMENT ON TABLE public.server_risk_profiles IS 'Aggregated risk data for each server';

-- ============================================================================
-- Column Comments — sessions behavioral flags (from 011)
-- ============================================================================
COMMENT ON COLUMN sessions.privilege_escalation IS 'MITRE Privilege Escalation detected (TA0004)';
COMMENT ON COLUMN sessions.data_exfiltration IS 'MITRE Exfiltration detected (TA0010)';
COMMENT ON COLUMN sessions.persistence IS 'MITRE Persistence detected (TA0003)';
COMMENT ON COLUMN sessions.lateral_movement IS 'MITRE Lateral Movement detected (TA0008)';
COMMENT ON COLUMN sessions.credential_access IS 'MITRE Credential Access detected (TA0006)';
COMMENT ON COLUMN sessions.defense_evasion IS 'MITRE Defense Evasion detected (TA0005)';
COMMENT ON COLUMN sessions.indicators IS 'Extracted IoCs: {ipAddresses: [], domains: [], fileHashes: [], urls: [], userAccounts: []}';
COMMENT ON COLUMN sessions.findings IS 'Detailed findings with MITRE technique IDs and evidence';

-- ============================================================================
-- Column Comments — user_bans (from 012)
-- ============================================================================
COMMENT ON COLUMN user_bans.server_id IS 'NULL means global ban (all servers)';
COMMENT ON COLUMN user_bans.expires_at IS 'NULL means permanent ban';
COMMENT ON COLUMN user_bans.session_id IS 'Optional reference to the session that triggered the ban';

-- ============================================================================
-- Column Comments — audit_log (from 016)
-- ============================================================================
COMMENT ON COLUMN audit_log.actor_id IS 'UUID of the user who performed the action (null for system actions)';
COMMENT ON COLUMN audit_log.actor_name IS 'Display name of the actor at time of action (denormalized for historical accuracy)';
COMMENT ON COLUMN audit_log.action IS 'Type of action performed (e.g., login_success, user_created, session_terminated)';
COMMENT ON COLUMN audit_log.resource_type IS 'Type of resource affected (e.g., user, server, session, group)';
COMMENT ON COLUMN audit_log.resource_id IS 'UUID of the affected resource';
COMMENT ON COLUMN audit_log.resource_name IS 'Human-readable name of the resource at time of action';
COMMENT ON COLUMN audit_log.details IS 'Additional context as JSON (e.g., changes made, reason for action)';
COMMENT ON COLUMN audit_log.ip_address IS 'IP address from which the action was performed';

-- ============================================================================
-- Function Comments (from 014)
-- ============================================================================
COMMENT ON FUNCTION user_has_permission IS 'Check if a user has a specific permission';
COMMENT ON FUNCTION get_role_permissions IS 'Get all permissions for a role';
