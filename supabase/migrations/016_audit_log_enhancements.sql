-- ============================================================================
-- Migration: Enhance audit_log table with actor_name and resource_name
-- ============================================================================

-- Add actor_name column for storing display name at time of action
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS actor_name TEXT;

-- Add resource_name column for human-readable resource identification
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS resource_name TEXT;

-- Add index on action for filtering
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);

-- Add index on resource_type for filtering
CREATE INDEX IF NOT EXISTS idx_audit_log_resource_type ON audit_log(resource_type);

-- Comment on table
COMMENT ON TABLE audit_log IS 'Immutable audit trail for compliance (SOX, HIPAA, PCI-DSS). Records all administrative and security-relevant actions.';

-- Comments on columns
COMMENT ON COLUMN audit_log.actor_id IS 'UUID of the user who performed the action (null for system actions)';
COMMENT ON COLUMN audit_log.actor_name IS 'Display name of the actor at time of action (denormalized for historical accuracy)';
COMMENT ON COLUMN audit_log.action IS 'Type of action performed (e.g., login_success, user_created, session_terminated)';
COMMENT ON COLUMN audit_log.resource_type IS 'Type of resource affected (e.g., user, server, session, group)';
COMMENT ON COLUMN audit_log.resource_id IS 'UUID of the affected resource';
COMMENT ON COLUMN audit_log.resource_name IS 'Human-readable name of the resource at time of action';
COMMENT ON COLUMN audit_log.details IS 'Additional context as JSON (e.g., changes made, reason for action)';
COMMENT ON COLUMN audit_log.ip_address IS 'IP address from which the action was performed';
