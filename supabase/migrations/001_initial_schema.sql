-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- =============================================================================
-- USER MANAGEMENT
-- =============================================================================

CREATE TABLE public.auditor_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    organization TEXT,
    role TEXT NOT NULL DEFAULT 'auditor'
        CHECK (role IN ('auditor', 'admin', 'viewer')),
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auditor_profiles_updated_at
    BEFORE UPDATE ON public.auditor_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- SERVER MANAGEMENT
-- =============================================================================

CREATE TABLE public.servers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    hostname TEXT NOT NULL,
    port INTEGER NOT NULL CHECK (port > 0 AND port <= 65535),
    protocol TEXT NOT NULL CHECK (protocol IN ('vnc', 'rdp', 'ssh')),
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    credentials_encrypted TEXT,
    created_by UUID REFERENCES public.auditor_profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_server_endpoint UNIQUE (hostname, port, protocol)
);

CREATE TRIGGER servers_updated_at
    BEFORE UPDATE ON public.servers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- SESSION MANAGEMENT
-- =============================================================================

CREATE TABLE public.sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
    client_user_id UUID NOT NULL REFERENCES public.auditor_profiles(id) ON DELETE CASCADE,
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
    user_agent TEXT
);

ALTER TABLE public.sessions
ADD COLUMN duration_seconds INTEGER
GENERATED ALWAYS AS (
    CASE
        WHEN ended_at IS NOT NULL THEN
            EXTRACT(EPOCH FROM (ended_at - started_at))::INTEGER
        ELSE NULL
    END
) STORED;

CREATE INDEX idx_sessions_server ON public.sessions(server_id);
CREATE INDEX idx_sessions_client ON public.sessions(client_user_id);
CREATE INDEX idx_sessions_status ON public.sessions(status);
CREATE INDEX idx_sessions_started ON public.sessions(started_at DESC);
CREATE INDEX idx_sessions_risk ON public.sessions(risk_level) WHERE risk_level IS NOT NULL;
CREATE INDEX idx_sessions_keystroke_data ON public.sessions USING GIN (keystroke_data);

-- =============================================================================
-- VIDEO EXPORT JOBS (On-Demand Generation)
-- =============================================================================
-- MP4 videos are NOT stored in Supabase Storage (too large for free tier)
-- Instead, they are generated on-demand when user requests download
-- This table tracks temporary export jobs for download

CREATE TABLE public.video_export_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'ready', 'expired', 'failed')),
    quality TEXT NOT NULL DEFAULT 'medium'
        CHECK (quality IN ('low', 'medium', 'high')),
    progress_percent INTEGER DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
    temp_file_path TEXT,  -- Temporary path on server disk (/tmp/video-{id}.mp4)
    output_size_bytes BIGINT,
    download_token TEXT UNIQUE,  -- One-time download token for security
    expires_at TIMESTAMPTZ,  -- Auto-delete after 1 hour
    downloaded_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    CONSTRAINT one_active_export_per_session UNIQUE (session_id)
);

CREATE INDEX idx_video_exports_status ON public.video_export_jobs(status);
CREATE INDEX idx_video_exports_token ON public.video_export_jobs(download_token) WHERE download_token IS NOT NULL;
CREATE INDEX idx_video_exports_expires ON public.video_export_jobs(expires_at) WHERE status = 'ready';

-- =============================================================================
-- AUDIT LOGGING
-- =============================================================================

CREATE TABLE public.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.auditor_profiles(id),
    user_email TEXT,
    action TEXT NOT NULL,
    resource_type TEXT,
    resource_id UUID,
    ip_address INET,
    user_agent TEXT,
    request_method TEXT,
    request_path TEXT,
    status_code INTEGER,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user ON public.audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX idx_audit_logs_created ON public.audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_resource ON public.audit_logs(resource_type, resource_id);

CREATE RULE audit_logs_immutable_update AS ON UPDATE TO public.audit_logs DO INSTEAD NOTHING;
CREATE RULE audit_logs_immutable_delete AS ON DELETE TO public.audit_logs DO INSTEAD NOTHING;

-- =============================================================================
-- VIEWS
-- =============================================================================

CREATE VIEW public.active_sessions AS
SELECT
    s.*,
    srv.name as server_name,
    srv.hostname as server_hostname,
    u.full_name as client_name,
    u.email as client_email,
    EXTRACT(EPOCH FROM (NOW() - s.started_at))::INTEGER as elapsed_seconds
FROM public.sessions s
JOIN public.servers srv ON s.server_id = srv.id
JOIN public.auditor_profiles u ON s.client_user_id = u.id
WHERE s.status = 'active'
ORDER BY s.started_at DESC;

CREATE VIEW public.session_statistics AS
SELECT
    COUNT(*) as total_sessions,
    COUNT(*) FILTER (WHERE status = 'active') as active_sessions,
    COUNT(*) FILTER (WHERE started_at > NOW() - INTERVAL '24 hours') as sessions_today,
    COUNT(*) FILTER (WHERE risk_level = 'high' OR risk_level = 'critical') as high_risk_sessions,
    AVG(duration_seconds) FILTER (WHERE duration_seconds IS NOT NULL) as avg_duration_seconds
FROM public.sessions;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE public.auditor_profiles IS 'User profiles for auditors and administrators';
COMMENT ON TABLE public.servers IS 'Remote server configurations available for connection';
COMMENT ON TABLE public.sessions IS 'Audit sessions with recordings and analysis';
COMMENT ON TABLE public.video_export_jobs IS 'On-demand MP4 generation jobs - videos generated temporarily and streamed to user, not stored in Supabase';
COMMENT ON TABLE public.audit_logs IS 'Immutable audit trail for compliance (SOC2)';
