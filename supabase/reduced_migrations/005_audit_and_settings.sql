-- ============================================================================
-- 005: Audit Log, Session Tokens, System Settings
-- ============================================================================

-- Audit Log (final form: 008 base + 016 enhancements)
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES users(id),
  actor_username TEXT,
  actor_name TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id UUID,
  resource_name TEXT,
  details JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_log_actor ON audit_log(actor_id);
CREATE INDEX idx_audit_log_created ON audit_log(created_at DESC);
CREATE INDEX idx_audit_log_action ON audit_log(action);
CREATE INDEX idx_audit_log_resource_type ON audit_log(resource_type);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON audit_log FOR ALL USING (true);

-- Session Tokens for JWT refresh (from 008)
CREATE TABLE session_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_session_tokens_user ON session_tokens(user_id);

ALTER TABLE session_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON session_tokens FOR ALL USING (true);

-- System Settings (from 008)
CREATE TABLE system_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES users(id)
);

INSERT INTO system_settings (key, value) VALUES
  ('recording_retention_days', '90'),
  ('auto_analyze_sessions', 'true'),
  ('risk_detection_enabled', 'true'),
  ('max_session_duration_minutes', '0'),
  ('idle_timeout_minutes', '30');

ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON system_settings FOR ALL USING (true);
