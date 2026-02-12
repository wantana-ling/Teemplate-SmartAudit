-- Enable RLS on all tables
ALTER TABLE public.auditor_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_export_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- AUDITOR PROFILES POLICIES
-- =============================================================================

CREATE POLICY "Users can view own profile"
    ON public.auditor_profiles
    FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON public.auditor_profiles
    FOR UPDATE
    USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
    ON public.auditor_profiles
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.auditor_profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Service role full access to profiles"
    ON public.auditor_profiles
    FOR ALL
    USING (auth.jwt()->>'role' = 'service_role');

-- =============================================================================
-- SERVERS POLICIES
-- =============================================================================

CREATE POLICY "Authenticated users can view active servers"
    ON public.servers
    FOR SELECT
    USING (auth.role() = 'authenticated' AND is_active = true);

CREATE POLICY "Admins can manage servers"
    ON public.servers
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.auditor_profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Service role full access to servers"
    ON public.servers
    FOR ALL
    USING (auth.jwt()->>'role' = 'service_role');

-- =============================================================================
-- SESSIONS POLICIES
-- =============================================================================

CREATE POLICY "Users can view own sessions"
    ON public.sessions
    FOR SELECT
    USING (client_user_id = auth.uid());

CREATE POLICY "Admins can view all sessions"
    ON public.sessions
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.auditor_profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Service role full access to sessions"
    ON public.sessions
    FOR ALL
    USING (auth.jwt()->>'role' = 'service_role');

-- =============================================================================
-- VIDEO EXPORT JOBS POLICIES
-- =============================================================================

CREATE POLICY "Users can view own export jobs"
    ON public.video_export_jobs
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.sessions
            WHERE sessions.id = video_export_jobs.session_id
            AND sessions.client_user_id = auth.uid()
        )
    );

CREATE POLICY "Admins can view all export jobs"
    ON public.video_export_jobs
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.auditor_profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Service role full access to export jobs"
    ON public.video_export_jobs
    FOR ALL
    USING (auth.jwt()->>'role' = 'service_role');

-- =============================================================================
-- AUDIT LOGS POLICIES
-- =============================================================================

CREATE POLICY "Admins can view audit logs"
    ON public.audit_logs
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.auditor_profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Service role can insert audit logs"
    ON public.audit_logs
    FOR INSERT
    WITH CHECK (auth.jwt()->>'role' = 'service_role');
