-- Migration: User ban system
-- Date: 2026-01-27
-- Purpose: Enable security team to ban users from servers or globally

CREATE TABLE IF NOT EXISTS user_bans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  server_id UUID REFERENCES servers(id) ON DELETE CASCADE, -- NULL = global ban (all servers)
  banned_by UUID NOT NULL REFERENCES users(id),
  banned_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ, -- NULL = permanent ban
  reason TEXT NOT NULL,
  lifted_by UUID REFERENCES users(id),
  lifted_at TIMESTAMPTZ,
  session_id UUID REFERENCES sessions(id), -- Optional: link to session that triggered ban
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for active ban lookups (most common query)
CREATE INDEX IF NOT EXISTS idx_user_bans_active ON user_bans(user_id, server_id)
  WHERE lifted_at IS NULL;

-- Index for user ban history
CREATE INDEX IF NOT EXISTS idx_user_bans_user ON user_bans(user_id, created_at DESC);

-- Index for server-specific bans
CREATE INDEX IF NOT EXISTS idx_user_bans_server ON user_bans(server_id)
  WHERE server_id IS NOT NULL AND lifted_at IS NULL;

-- Index for finding expired bans to clean up
CREATE INDEX IF NOT EXISTS idx_user_bans_expires ON user_bans(expires_at)
  WHERE expires_at IS NOT NULL AND lifted_at IS NULL;

-- Function to check if user is banned (returns ban info if banned)
CREATE OR REPLACE FUNCTION is_user_banned(p_user_id UUID, p_server_id UUID DEFAULT NULL)
RETURNS TABLE(banned BOOLEAN, ban_id UUID, reason TEXT, expires_at TIMESTAMPTZ, is_global BOOLEAN) AS $$
BEGIN
  -- Check global ban first (server_id IS NULL)
  RETURN QUERY
  SELECT
    true AS banned,
    ub.id AS ban_id,
    ub.reason,
    ub.expires_at,
    true AS is_global
  FROM user_bans ub
  WHERE ub.user_id = p_user_id
    AND ub.server_id IS NULL
    AND ub.lifted_at IS NULL
    AND (ub.expires_at IS NULL OR ub.expires_at > NOW())
  LIMIT 1;

  IF NOT FOUND AND p_server_id IS NOT NULL THEN
    -- Check server-specific ban
    RETURN QUERY
    SELECT
      true AS banned,
      ub.id AS ban_id,
      ub.reason,
      ub.expires_at,
      false AS is_global
    FROM user_bans ub
    WHERE ub.user_id = p_user_id
      AND ub.server_id = p_server_id
      AND ub.lifted_at IS NULL
      AND (ub.expires_at IS NULL OR ub.expires_at > NOW())
    LIMIT 1;
  END IF;

  -- If no ban found, return not banned
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, NULL::TIMESTAMPTZ, NULL::BOOLEAN;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to lift a ban
CREATE OR REPLACE FUNCTION lift_user_ban(p_ban_id UUID, p_lifted_by UUID)
RETURNS BOOLEAN AS $$
DECLARE
  rows_affected INTEGER;
BEGIN
  UPDATE user_bans
  SET lifted_by = p_lifted_by,
      lifted_at = NOW()
  WHERE id = p_ban_id
    AND lifted_at IS NULL;

  GET DIAGNOSTICS rows_affected = ROW_COUNT;
  RETURN rows_affected > 0;
END;
$$ LANGUAGE plpgsql;

-- View for active bans
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

COMMENT ON TABLE user_bans IS 'User bans - server-specific or global';
COMMENT ON COLUMN user_bans.server_id IS 'NULL means global ban (all servers)';
COMMENT ON COLUMN user_bans.expires_at IS 'NULL means permanent ban';
COMMENT ON COLUMN user_bans.session_id IS 'Optional reference to the session that triggered the ban';
