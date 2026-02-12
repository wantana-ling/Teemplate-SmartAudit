-- ============================================================================
-- 004: Access Control — groups, user_groups, server_access, user_bans
-- ============================================================================

-- Groups (Discord-style roles, from 008)
CREATE TABLE groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#6B7280',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON groups FOR ALL USING (true);

-- User-Group membership (from 008 v2)
CREATE TABLE user_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  assigned_by UUID REFERENCES users(id),
  UNIQUE(user_id, group_id)
);

CREATE INDEX idx_user_groups_user ON user_groups(user_id);
CREATE INDEX idx_user_groups_group ON user_groups(group_id);

ALTER TABLE user_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON user_groups FOR ALL USING (true);

-- Server Access Permissions (from 008)
CREATE TABLE server_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  granted_by UUID REFERENCES users(id),
  CHECK (user_id IS NOT NULL OR group_id IS NOT NULL),
  UNIQUE NULLS NOT DISTINCT (server_id, user_id),
  UNIQUE NULLS NOT DISTINCT (server_id, group_id)
);

CREATE INDEX idx_server_access_server ON server_access(server_id);
CREATE INDEX idx_server_access_user ON server_access(user_id);
CREATE INDEX idx_server_access_group ON server_access(group_id);

ALTER TABLE server_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON server_access FOR ALL USING (true);

-- User Bans (from 012)
CREATE TABLE user_bans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  server_id UUID REFERENCES servers(id) ON DELETE CASCADE,
  banned_by UUID NOT NULL REFERENCES users(id),
  banned_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  reason TEXT NOT NULL,
  lifted_by UUID REFERENCES users(id),
  lifted_at TIMESTAMPTZ,
  session_id UUID REFERENCES sessions(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_bans_active ON user_bans(user_id, server_id)
  WHERE lifted_at IS NULL;
CREATE INDEX idx_user_bans_user ON user_bans(user_id, created_at DESC);
CREATE INDEX idx_user_bans_server ON user_bans(server_id)
  WHERE server_id IS NOT NULL AND lifted_at IS NULL;
CREATE INDEX idx_user_bans_expires ON user_bans(expires_at)
  WHERE expires_at IS NOT NULL AND lifted_at IS NULL;

-- ============================================================================
-- Access Control Functions
-- ============================================================================

-- Check if user has direct or group-based server access (from 008)
CREATE OR REPLACE FUNCTION user_has_server_access(p_user_id UUID, p_server_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM server_access
    WHERE server_id = p_server_id AND user_id = p_user_id
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1 FROM server_access sa
    JOIN user_groups ug ON ug.group_id = sa.group_id
    WHERE sa.server_id = p_server_id AND ug.user_id = p_user_id
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$ LANGUAGE plpgsql;

-- Check if user is banned (from 012)
CREATE OR REPLACE FUNCTION is_user_banned(p_user_id UUID, p_server_id UUID DEFAULT NULL)
RETURNS TABLE(banned BOOLEAN, ban_id UUID, reason TEXT, expires_at TIMESTAMPTZ, is_global BOOLEAN) AS $$
BEGIN
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

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, NULL::TIMESTAMPTZ, NULL::BOOLEAN;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Lift a ban (from 012)
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

-- Check if a user has a specific permission (from 014)
CREATE OR REPLACE FUNCTION user_has_permission(p_user_id UUID, p_permission TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_role TEXT;
  v_permissions JSONB;
BEGIN
  SELECT role INTO v_role FROM users WHERE id = p_user_id AND enabled = true;

  IF v_role IS NULL THEN
    RETURN false;
  END IF;

  SELECT permissions INTO v_permissions FROM role_permissions WHERE role = v_role;

  IF v_permissions IS NULL THEN
    RETURN false;
  END IF;

  IF (v_permissions->>'all')::boolean = true THEN
    RETURN true;
  END IF;

  RETURN COALESCE((v_permissions->>p_permission)::boolean, false);
END;
$$ LANGUAGE plpgsql;

-- Get all permissions for a role (from 014)
CREATE OR REPLACE FUNCTION get_role_permissions(p_role TEXT)
RETURNS JSONB AS $$
DECLARE
  v_permissions JSONB;
BEGIN
  SELECT permissions INTO v_permissions FROM role_permissions WHERE role = p_role;
  RETURN COALESCE(v_permissions, '{}'::jsonb);
END;
$$ LANGUAGE plpgsql;
