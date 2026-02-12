-- Migration: User and server risk profiles
-- Date: 2026-01-27
-- Purpose: Aggregate risk data for users and servers for analytics and monitoring

-- User risk aggregation table
CREATE TABLE IF NOT EXISTS user_risk_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  total_sessions INTEGER DEFAULT 0,
  high_risk_sessions INTEGER DEFAULT 0,
  critical_sessions INTEGER DEFAULT 0,

  -- Behavioral pattern counts (cumulative)
  privilege_escalation_count INTEGER DEFAULT 0,
  data_exfiltration_count INTEGER DEFAULT 0,
  persistence_count INTEGER DEFAULT 0,
  lateral_movement_count INTEGER DEFAULT 0,
  credential_access_count INTEGER DEFAULT 0,
  defense_evasion_count INTEGER DEFAULT 0,

  -- Risk scores (0-100, computed periodically)
  risk_score_7d NUMERIC(5,2) DEFAULT 0,
  risk_score_30d NUMERIC(5,2) DEFAULT 0,
  risk_score_all_time NUMERIC(5,2) DEFAULT 0,

  -- Timestamps
  last_session_at TIMESTAMPTZ,
  last_high_risk_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Server risk aggregation table
CREATE TABLE IF NOT EXISTS server_risk_profiles (
  server_id UUID PRIMARY KEY REFERENCES servers(id) ON DELETE CASCADE,
  total_sessions INTEGER DEFAULT 0,
  high_risk_sessions INTEGER DEFAULT 0,
  critical_sessions INTEGER DEFAULT 0,
  unique_users INTEGER DEFAULT 0,

  -- Risk scores
  risk_score_7d NUMERIC(5,2) DEFAULT 0,
  risk_score_30d NUMERIC(5,2) DEFAULT 0,

  -- Timestamps
  last_session_at TIMESTAMPTZ,
  last_high_risk_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for high-risk user queries
CREATE INDEX IF NOT EXISTS idx_user_risk_high ON user_risk_profiles(risk_score_7d DESC)
  WHERE risk_score_7d > 50;

-- Index for high-risk server queries
CREATE INDEX IF NOT EXISTS idx_server_risk_high ON server_risk_profiles(risk_score_7d DESC)
  WHERE risk_score_7d > 50;

-- Function to recalculate user risk profile
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
  -- Count sessions and behavioral flags
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

  -- Calculate 7-day risk score (weighted average of recent sessions)
  SELECT COALESCE(
    (
      SUM(
        CASE risk_level
          WHEN 'critical' THEN 100
          WHEN 'high' THEN 75
          WHEN 'medium' THEN 40
          ELSE 10
        END *
        -- Weight by behavioral flags
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

  -- Calculate 30-day risk score
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

  -- Cap scores at 100
  v_score_7d := LEAST(v_score_7d, 100);
  v_score_30d := LEAST(v_score_30d, 100);

  -- Upsert the profile
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

-- Function to recalculate server risk profile
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
  -- Count sessions
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

  -- Calculate 7-day risk score
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

  -- Calculate 30-day risk score
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

  -- Cap scores at 100
  v_score_7d := LEAST(v_score_7d, 100);
  v_score_30d := LEAST(v_score_30d, 100);

  -- Upsert the profile
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

-- Trigger to update profiles on session end
CREATE OR REPLACE FUNCTION update_risk_profiles_on_session_end()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'disconnected' AND (OLD.status IS NULL OR OLD.status != 'disconnected') THEN
    -- Update user profile
    PERFORM recalculate_user_risk_profile(NEW.user_id);

    -- Update server profile
    PERFORM recalculate_server_risk_profile(NEW.server_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS session_end_profile_update ON sessions;

-- Create trigger
CREATE TRIGGER session_end_profile_update
  AFTER UPDATE ON sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_risk_profiles_on_session_end();

COMMENT ON TABLE user_risk_profiles IS 'Aggregated risk data for each user';
COMMENT ON TABLE server_risk_profiles IS 'Aggregated risk data for each server';
