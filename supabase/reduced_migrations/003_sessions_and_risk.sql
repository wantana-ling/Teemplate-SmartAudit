-- ============================================================================
-- 003: Sessions, Video Exports, Risk Alerts, Risk Profiles
-- ============================================================================

-- Sessions table (final form: 006 base + 009 user_id + 010 review + 011 MITRE
-- + 017 denormalized server info + nullable server_id ON DELETE SET NULL)
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID REFERENCES servers(id) ON DELETE SET NULL,
  client_user_id UUID,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'connecting'
    CHECK (status IN ('connecting', 'active', 'disconnected', 'error')),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  guac_recording_url TEXT,
  guac_file_size_bytes BIGINT,
  thumbnail_url TEXT,
  keystroke_data JSONB DEFAULT '[]'::jsonb,
  keystroke_count INTEGER DEFAULT 0,
  mouse_event_count INTEGER DEFAULT 0,
  ai_summary TEXT,
  risk_level TEXT CHECK (risk_level IS NULL OR risk_level IN ('low', 'medium', 'high', 'critical')),
  risk_factors JSONB DEFAULT '[]'::jsonb,
  suspicious_activities JSONB DEFAULT '[]'::jsonb,
  analyzed_at TIMESTAMPTZ,
  error_message TEXT,
  connection_id TEXT,
  client_ip INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Review tracking (010)
  reviewed BOOLEAN DEFAULT false,
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  tags JSONB DEFAULT '[]'::jsonb,

  -- Behavioral flags — MITRE ATT&CK aligned (011)
  privilege_escalation BOOLEAN DEFAULT false,
  data_exfiltration BOOLEAN DEFAULT false,
  persistence BOOLEAN DEFAULT false,
  lateral_movement BOOLEAN DEFAULT false,
  credential_access BOOLEAN DEFAULT false,
  defense_evasion BOOLEAN DEFAULT false,
  indicators JSONB DEFAULT '{}'::jsonb,
  findings JSONB DEFAULT '[]'::jsonb,

  -- Denormalized server info for history preservation (017)
  server_name TEXT,
  server_host TEXT,
  server_protocol TEXT
);

-- Computed column for duration
ALTER TABLE sessions
ADD COLUMN duration_seconds INTEGER
GENERATED ALWAYS AS (
  CASE
    WHEN ended_at IS NOT NULL THEN
      EXTRACT(EPOCH FROM (ended_at - started_at))::INTEGER
    ELSE NULL
  END
) STORED;

-- Core indexes
CREATE INDEX sessions_server_id_idx ON sessions(server_id);
CREATE INDEX sessions_client_user_id_idx ON sessions(client_user_id);
CREATE INDEX sessions_user_id_idx ON sessions(user_id);
CREATE INDEX sessions_status_idx ON sessions(status);
CREATE INDEX sessions_started_at_idx ON sessions(started_at DESC);
CREATE INDEX sessions_risk_level_idx ON sessions(risk_level) WHERE risk_level IS NOT NULL;
CREATE INDEX sessions_keystroke_data_idx ON sessions USING GIN (keystroke_data);

-- Review indexes (010)
CREATE INDEX sessions_reviewed_idx ON sessions(reviewed);
CREATE INDEX sessions_tags_idx ON sessions USING GIN(tags);
CREATE INDEX sessions_reviewed_at_idx ON sessions(reviewed_at);
CREATE INDEX sessions_unreviewed_risk_idx ON sessions(reviewed, risk_level)
  WHERE reviewed = false AND risk_level IN ('critical', 'high');

-- Behavioral flag indexes (011)
CREATE INDEX sessions_behavioral_idx ON sessions
  (privilege_escalation, data_exfiltration, persistence, lateral_movement, credential_access, defense_evasion)
  WHERE privilege_escalation = true OR data_exfiltration = true OR persistence = true
    OR lateral_movement = true OR credential_access = true OR defense_evasion = true;
CREATE INDEX sessions_privilege_escalation_idx ON sessions(privilege_escalation) WHERE privilege_escalation = true;
CREATE INDEX sessions_data_exfiltration_idx ON sessions(data_exfiltration) WHERE data_exfiltration = true;
CREATE INDEX sessions_persistence_idx ON sessions(persistence) WHERE persistence = true;
CREATE INDEX sessions_lateral_movement_idx ON sessions(lateral_movement) WHERE lateral_movement = true;
CREATE INDEX sessions_credential_access_idx ON sessions(credential_access) WHERE credential_access = true;
CREATE INDEX sessions_defense_evasion_idx ON sessions(defense_evasion) WHERE defense_evasion = true;
CREATE INDEX sessions_indicators_idx ON sessions USING GIN(indicators);
CREATE INDEX sessions_findings_idx ON sessions USING GIN(findings);

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on sessions"
  ON sessions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER sessions_updated_at
  BEFORE UPDATE ON sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_sessions_updated_at();

GRANT ALL ON sessions TO authenticated;
GRANT ALL ON sessions TO service_role;

-- ============================================================================
-- Video Export Jobs (from 001)
-- ============================================================================
CREATE TABLE video_export_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'ready', 'expired', 'failed')),
  quality TEXT NOT NULL DEFAULT 'medium'
    CHECK (quality IN ('low', 'medium', 'high')),
  progress_percent INTEGER DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
  temp_file_path TEXT,
  output_size_bytes BIGINT,
  download_token TEXT UNIQUE,
  expires_at TIMESTAMPTZ,
  downloaded_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  CONSTRAINT one_active_export_per_session UNIQUE (session_id)
);

CREATE INDEX idx_video_exports_status ON video_export_jobs(status);
CREATE INDEX idx_video_exports_token ON video_export_jobs(download_token) WHERE download_token IS NOT NULL;
CREATE INDEX idx_video_exports_expires ON video_export_jobs(expires_at) WHERE status = 'ready';

-- ============================================================================
-- Risk Alerts (from 008)
-- ============================================================================
CREATE TABLE risk_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  level TEXT NOT NULL CHECK (level IN ('low', 'medium', 'high', 'critical')),
  pattern TEXT NOT NULL,
  matched_text TEXT NOT NULL,
  acknowledged BOOLEAN DEFAULT false,
  acknowledged_by UUID REFERENCES users(id),
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_risk_alerts_session ON risk_alerts(session_id);
CREATE INDEX idx_risk_alerts_level ON risk_alerts(level);

ALTER TABLE risk_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON risk_alerts FOR ALL USING (true);

-- ============================================================================
-- User Risk Profiles (from 013)
-- ============================================================================
CREATE TABLE user_risk_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  total_sessions INTEGER DEFAULT 0,
  high_risk_sessions INTEGER DEFAULT 0,
  critical_sessions INTEGER DEFAULT 0,
  privilege_escalation_count INTEGER DEFAULT 0,
  data_exfiltration_count INTEGER DEFAULT 0,
  persistence_count INTEGER DEFAULT 0,
  lateral_movement_count INTEGER DEFAULT 0,
  credential_access_count INTEGER DEFAULT 0,
  defense_evasion_count INTEGER DEFAULT 0,
  risk_score_7d NUMERIC(5,2) DEFAULT 0,
  risk_score_30d NUMERIC(5,2) DEFAULT 0,
  risk_score_all_time NUMERIC(5,2) DEFAULT 0,
  last_session_at TIMESTAMPTZ,
  last_high_risk_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_risk_high ON user_risk_profiles(risk_score_7d DESC)
  WHERE risk_score_7d > 50;

-- ============================================================================
-- Server Risk Profiles (from 013)
-- ============================================================================
CREATE TABLE server_risk_profiles (
  server_id UUID PRIMARY KEY REFERENCES servers(id) ON DELETE CASCADE,
  total_sessions INTEGER DEFAULT 0,
  high_risk_sessions INTEGER DEFAULT 0,
  critical_sessions INTEGER DEFAULT 0,
  unique_users INTEGER DEFAULT 0,
  risk_score_7d NUMERIC(5,2) DEFAULT 0,
  risk_score_30d NUMERIC(5,2) DEFAULT 0,
  last_session_at TIMESTAMPTZ,
  last_high_risk_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_server_risk_high ON server_risk_profiles(risk_score_7d DESC)
  WHERE risk_score_7d > 50;

-- ============================================================================
-- Risk Calculation Functions (from 013)
-- ============================================================================
CREATE OR REPLACE FUNCTION recalculate_user_risk_profile(p_user_id UUID)
RETURNS void AS $$
DECLARE
  v_total INTEGER;
  v_high INTEGER;
  v_critical INTEGER;
  v_priv_esc INTEGER;
  v_data_exfil INTEGER;
  v_persist INTEGER;
  v_lateral INTEGER;
  v_cred INTEGER;
  v_defense INTEGER;
  v_score_7d NUMERIC;
  v_score_30d NUMERIC;
  v_last_session TIMESTAMPTZ;
  v_last_high_risk TIMESTAMPTZ;
BEGIN
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE risk_level IN ('high', 'critical')),
    COUNT(*) FILTER (WHERE risk_level = 'critical'),
    COUNT(*) FILTER (WHERE privilege_escalation = true),
    COUNT(*) FILTER (WHERE data_exfiltration = true),
    COUNT(*) FILTER (WHERE persistence = true),
    COUNT(*) FILTER (WHERE lateral_movement = true),
    COUNT(*) FILTER (WHERE credential_access = true),
    COUNT(*) FILTER (WHERE defense_evasion = true),
    MAX(started_at),
    MAX(started_at) FILTER (WHERE risk_level IN ('high', 'critical'))
  INTO
    v_total, v_high, v_critical,
    v_priv_esc, v_data_exfil, v_persist, v_lateral, v_cred, v_defense,
    v_last_session, v_last_high_risk
  FROM sessions
  WHERE user_id = p_user_id
    AND status = 'disconnected';

  SELECT COALESCE(
    (
      SUM(
        CASE risk_level
          WHEN 'critical' THEN 100
          WHEN 'high' THEN 75
          WHEN 'medium' THEN 40
          ELSE 10
        END *
        (1 +
          (CASE WHEN privilege_escalation THEN 0.2 ELSE 0 END) +
          (CASE WHEN data_exfiltration THEN 0.3 ELSE 0 END) +
          (CASE WHEN credential_access THEN 0.2 ELSE 0 END) +
          (CASE WHEN lateral_movement THEN 0.15 ELSE 0 END) +
          (CASE WHEN persistence THEN 0.1 ELSE 0 END) +
          (CASE WHEN defense_evasion THEN 0.15 ELSE 0 END)
        )
      ) / NULLIF(COUNT(*), 0)
    )::NUMERIC, 0)
  INTO v_score_7d
  FROM sessions
  WHERE user_id = p_user_id
    AND status = 'disconnected'
    AND started_at > NOW() - INTERVAL '7 days';

  SELECT COALESCE(
    (
      SUM(
        CASE risk_level
          WHEN 'critical' THEN 100
          WHEN 'high' THEN 75
          WHEN 'medium' THEN 40
          ELSE 10
        END
      ) / NULLIF(COUNT(*), 0)
    )::NUMERIC, 0)
  INTO v_score_30d
  FROM sessions
  WHERE user_id = p_user_id
    AND status = 'disconnected'
    AND started_at > NOW() - INTERVAL '30 days';

  v_score_7d := LEAST(v_score_7d, 100);
  v_score_30d := LEAST(v_score_30d, 100);

  INSERT INTO user_risk_profiles (
    user_id, total_sessions, high_risk_sessions, critical_sessions,
    privilege_escalation_count, data_exfiltration_count, persistence_count,
    lateral_movement_count, credential_access_count, defense_evasion_count,
    risk_score_7d, risk_score_30d,
    last_session_at, last_high_risk_at, updated_at
  ) VALUES (
    p_user_id, v_total, v_high, v_critical,
    v_priv_esc, v_data_exfil, v_persist, v_lateral, v_cred, v_defense,
    v_score_7d, v_score_30d,
    v_last_session, v_last_high_risk, NOW()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    total_sessions = EXCLUDED.total_sessions,
    high_risk_sessions = EXCLUDED.high_risk_sessions,
    critical_sessions = EXCLUDED.critical_sessions,
    privilege_escalation_count = EXCLUDED.privilege_escalation_count,
    data_exfiltration_count = EXCLUDED.data_exfiltration_count,
    persistence_count = EXCLUDED.persistence_count,
    lateral_movement_count = EXCLUDED.lateral_movement_count,
    credential_access_count = EXCLUDED.credential_access_count,
    defense_evasion_count = EXCLUDED.defense_evasion_count,
    risk_score_7d = EXCLUDED.risk_score_7d,
    risk_score_30d = EXCLUDED.risk_score_30d,
    last_session_at = EXCLUDED.last_session_at,
    last_high_risk_at = EXCLUDED.last_high_risk_at,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION recalculate_server_risk_profile(p_server_id UUID)
RETURNS void AS $$
DECLARE
  v_total INTEGER;
  v_high INTEGER;
  v_critical INTEGER;
  v_unique_users INTEGER;
  v_score_7d NUMERIC;
  v_score_30d NUMERIC;
  v_last_session TIMESTAMPTZ;
  v_last_high_risk TIMESTAMPTZ;
BEGIN
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE risk_level IN ('high', 'critical')),
    COUNT(*) FILTER (WHERE risk_level = 'critical'),
    COUNT(DISTINCT user_id),
    MAX(started_at),
    MAX(started_at) FILTER (WHERE risk_level IN ('high', 'critical'))
  INTO
    v_total, v_high, v_critical, v_unique_users,
    v_last_session, v_last_high_risk
  FROM sessions
  WHERE server_id = p_server_id
    AND status = 'disconnected';

  SELECT COALESCE(
    (
      SUM(
        CASE risk_level
          WHEN 'critical' THEN 100
          WHEN 'high' THEN 75
          WHEN 'medium' THEN 40
          ELSE 10
        END
      ) / NULLIF(COUNT(*), 0)
    )::NUMERIC, 0)
  INTO v_score_7d
  FROM sessions
  WHERE server_id = p_server_id
    AND status = 'disconnected'
    AND started_at > NOW() - INTERVAL '7 days';

  SELECT COALESCE(
    (
      SUM(
        CASE risk_level
          WHEN 'critical' THEN 100
          WHEN 'high' THEN 75
          WHEN 'medium' THEN 40
          ELSE 10
        END
      ) / NULLIF(COUNT(*), 0)
    )::NUMERIC, 0)
  INTO v_score_30d
  FROM sessions
  WHERE server_id = p_server_id
    AND status = 'disconnected'
    AND started_at > NOW() - INTERVAL '30 days';

  v_score_7d := LEAST(v_score_7d, 100);
  v_score_30d := LEAST(v_score_30d, 100);

  INSERT INTO server_risk_profiles (
    server_id, total_sessions, high_risk_sessions, critical_sessions,
    unique_users, risk_score_7d, risk_score_30d,
    last_session_at, last_high_risk_at, updated_at
  ) VALUES (
    p_server_id, v_total, v_high, v_critical,
    v_unique_users, v_score_7d, v_score_30d,
    v_last_session, v_last_high_risk, NOW()
  )
  ON CONFLICT (server_id) DO UPDATE SET
    total_sessions = EXCLUDED.total_sessions,
    high_risk_sessions = EXCLUDED.high_risk_sessions,
    critical_sessions = EXCLUDED.critical_sessions,
    unique_users = EXCLUDED.unique_users,
    risk_score_7d = EXCLUDED.risk_score_7d,
    risk_score_30d = EXCLUDED.risk_score_30d,
    last_session_at = EXCLUDED.last_session_at,
    last_high_risk_at = EXCLUDED.last_high_risk_at,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Trigger to update profiles on session end (from 013)
CREATE OR REPLACE FUNCTION update_risk_profiles_on_session_end()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'disconnected' AND (OLD.status IS NULL OR OLD.status != 'disconnected') THEN
    PERFORM recalculate_user_risk_profile(NEW.user_id);
    PERFORM recalculate_server_risk_profile(NEW.server_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER session_end_profile_update
  AFTER UPDATE ON sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_risk_profiles_on_session_end();
