-- ============================================================================
-- Sessions Table Update for Client App
-- ============================================================================
-- Fix sessions table to work with the new servers schema and client users

-- Drop existing sessions table and recreate
DROP TABLE IF EXISTS public.sessions CASCADE;

CREATE TABLE public.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL,
  client_user_id UUID NOT NULL,
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
  CONSTRAINT sessions_server_id_fkey FOREIGN KEY (server_id) REFERENCES public.servers(id) ON DELETE CASCADE,
  CONSTRAINT sessions_client_user_id_fkey FOREIGN KEY (client_user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Add computed column for duration
ALTER TABLE public.sessions
ADD COLUMN duration_seconds INTEGER
GENERATED ALWAYS AS (
  CASE
    WHEN ended_at IS NOT NULL THEN
      EXTRACT(EPOCH FROM (ended_at - started_at))::INTEGER
    ELSE NULL
  END
) STORED;

-- Indexes
CREATE INDEX sessions_server_id_idx ON public.sessions(server_id);
CREATE INDEX sessions_client_user_id_idx ON public.sessions(client_user_id);
CREATE INDEX sessions_status_idx ON public.sessions(status);
CREATE INDEX sessions_started_at_idx ON public.sessions(started_at DESC);
CREATE INDEX sessions_risk_level_idx ON public.sessions(risk_level) WHERE risk_level IS NOT NULL;
CREATE INDEX sessions_keystroke_data_idx ON public.sessions USING GIN (keystroke_data);

-- Enable RLS
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own sessions"
  ON public.sessions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = client_user_id);

CREATE POLICY "Users can create their own sessions"
  ON public.sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = client_user_id);

CREATE POLICY "Users can update their own sessions"
  ON public.sessions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = client_user_id)
  WITH CHECK (auth.uid() = client_user_id);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sessions_updated_at
  BEFORE UPDATE ON public.sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_sessions_updated_at();

-- Grant permissions
GRANT ALL ON public.sessions TO authenticated;
GRANT ALL ON public.sessions TO service_role;

-- Create view for active sessions
CREATE OR REPLACE VIEW public.active_sessions AS
SELECT
  s.*,
  srv.name as server_name,
  srv.host as server_host,
  srv.protocol as server_protocol
FROM public.sessions s
JOIN public.servers srv ON s.server_id = srv.id
WHERE s.status = 'active'
ORDER BY s.started_at DESC;

-- Grant permissions on view
GRANT SELECT ON public.active_sessions TO authenticated;
GRANT SELECT ON public.active_sessions TO service_role;
