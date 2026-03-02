-- ============================================================================
-- 002: Core Tables — users, servers, role_permissions
-- ============================================================================

-- Users table (final form: 008 base + 014 security role in CHECK)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  email TEXT UNIQUE,
  email_verified BOOLEAN DEFAULT false,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'admin', 'security', 'auditor', 'client')),
  department TEXT,
  enabled BOOLEAN DEFAULT true,
  avatar_color TEXT DEFAULT '#3B82F6',
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_department ON users(department);
CREATE INDEX idx_users_enabled ON users(enabled);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON users FOR ALL USING (true);

-- Servers table (final form: 005 base + 007 enabled + 015 nullable user_id, no FK)
CREATE TABLE servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  name TEXT NOT NULL,
  host TEXT NOT NULL,
  port INTEGER NOT NULL DEFAULT 22,
  protocol TEXT NOT NULL CHECK (protocol IN ('ssh', 'rdp', 'vnc')),
  username TEXT,
  password TEXT,
  description TEXT,
  tags TEXT[],
  department TEXT[],
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX servers_user_id_idx ON servers(user_id);
CREATE INDEX servers_created_at_idx ON servers(created_at DESC);
CREATE INDEX idx_servers_department ON servers USING GIN(department);

ALTER TABLE servers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON servers FOR ALL USING (true);

CREATE TRIGGER servers_updated_at
  BEFORE UPDATE ON servers
  FOR EACH ROW
  EXECUTE FUNCTION update_servers_updated_at();

GRANT ALL ON servers TO authenticated;
GRANT ALL ON servers TO service_role;

-- Role permissions lookup table (from 014)
CREATE TABLE role_permissions (
  role TEXT PRIMARY KEY,
  permissions JSONB NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO role_permissions (role, permissions, description) VALUES
  ('super_admin', '{
    "all": true
  }', 'Full system access - can do everything'),

  ('admin', '{
    "users.view": true,
    "users.create": true,
    "users.edit": true,
    "users.disable": true,
    "servers.view": true,
    "servers.create": true,
    "servers.edit": true,
    "servers.delete": true,
    "groups.view": true,
    "groups.create": true,
    "groups.edit": true,
    "groups.delete": true,
    "sessions.view": true,
    "analytics.view": true
  }', 'User/server/group management, read-only sessions'),

  ('security', '{
    "sessions.view": true,
    "sessions.terminate": true,
    "sessions.ban": true,
    "sessions.review": true,
    "sessions.tag": true,
    "live.view": true,
    "analytics.view": true,
    "bans.view": true,
    "bans.create": true,
    "bans.lift": true
  }', 'Security operations - session monitoring, termination, bans'),

  ('auditor', '{
    "sessions.view": true,
    "reports.view": true,
    "analytics.view": true
  }', 'Read-only audit access to completed sessions'),

  ('client', '{
    "client.use": true
  }', 'Client desktop app only - connect to assigned servers');
