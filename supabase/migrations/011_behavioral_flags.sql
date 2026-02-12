-- Migration: Add behavioral flags to sessions
-- Date: 2026-01-27
-- Purpose: Track MITRE ATT&CK-aligned behavioral patterns detected during sessions

-- Add behavioral flag columns to sessions table
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS privilege_escalation BOOLEAN DEFAULT false;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS data_exfiltration BOOLEAN DEFAULT false;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS persistence BOOLEAN DEFAULT false;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS lateral_movement BOOLEAN DEFAULT false;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS credential_access BOOLEAN DEFAULT false;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS defense_evasion BOOLEAN DEFAULT false;

-- Add IoC storage (Indicators of Compromise)
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS indicators JSONB DEFAULT '{}'::jsonb;

-- Add findings storage (detailed findings with MITRE technique IDs)
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS findings JSONB DEFAULT '[]'::jsonb;

-- Index for behavioral flag filtering (composite index for common queries)
CREATE INDEX IF NOT EXISTS sessions_behavioral_idx ON sessions
  (privilege_escalation, data_exfiltration, persistence, lateral_movement, credential_access, defense_evasion)
  WHERE privilege_escalation = true OR data_exfiltration = true OR persistence = true
    OR lateral_movement = true OR credential_access = true OR defense_evasion = true;

-- Individual indexes for single-flag queries
CREATE INDEX IF NOT EXISTS sessions_privilege_escalation_idx ON sessions(privilege_escalation) WHERE privilege_escalation = true;
CREATE INDEX IF NOT EXISTS sessions_data_exfiltration_idx ON sessions(data_exfiltration) WHERE data_exfiltration = true;
CREATE INDEX IF NOT EXISTS sessions_persistence_idx ON sessions(persistence) WHERE persistence = true;
CREATE INDEX IF NOT EXISTS sessions_lateral_movement_idx ON sessions(lateral_movement) WHERE lateral_movement = true;
CREATE INDEX IF NOT EXISTS sessions_credential_access_idx ON sessions(credential_access) WHERE credential_access = true;
CREATE INDEX IF NOT EXISTS sessions_defense_evasion_idx ON sessions(defense_evasion) WHERE defense_evasion = true;

-- GIN index for IoC queries
CREATE INDEX IF NOT EXISTS sessions_indicators_idx ON sessions USING GIN(indicators);

-- GIN index for findings queries
CREATE INDEX IF NOT EXISTS sessions_findings_idx ON sessions USING GIN(findings);

COMMENT ON COLUMN sessions.privilege_escalation IS 'MITRE Privilege Escalation detected (TA0004)';
COMMENT ON COLUMN sessions.data_exfiltration IS 'MITRE Exfiltration detected (TA0010)';
COMMENT ON COLUMN sessions.persistence IS 'MITRE Persistence detected (TA0003)';
COMMENT ON COLUMN sessions.lateral_movement IS 'MITRE Lateral Movement detected (TA0008)';
COMMENT ON COLUMN sessions.credential_access IS 'MITRE Credential Access detected (TA0006)';
COMMENT ON COLUMN sessions.defense_evasion IS 'MITRE Defense Evasion detected (TA0005)';
COMMENT ON COLUMN sessions.indicators IS 'Extracted IoCs: {ipAddresses: [], domains: [], fileHashes: [], urls: [], userAccounts: []}';
COMMENT ON COLUMN sessions.findings IS 'Detailed findings with MITRE technique IDs and evidence';
