-- Migration: Add session review tracking and tags
-- Date: 2026-01-26
-- Purpose: Enable auditors to mark sessions as reviewed and tag sessions for organization

-- Add review tracking columns to sessions table
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS reviewed BOOLEAN DEFAULT false;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS review_notes TEXT;

-- Add tags column (JSONB array of strings)
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb;

-- Create indexes for efficient filtering
CREATE INDEX IF NOT EXISTS sessions_reviewed_idx ON sessions(reviewed);
CREATE INDEX IF NOT EXISTS sessions_tags_idx ON sessions USING GIN(tags);
CREATE INDEX IF NOT EXISTS sessions_reviewed_at_idx ON sessions(reviewed_at);

-- Add a composite index for common query patterns (unreviewed high-risk sessions)
CREATE INDEX IF NOT EXISTS sessions_unreviewed_risk_idx ON sessions(reviewed, risk_level)
  WHERE reviewed = false AND risk_level IN ('critical', 'high');
