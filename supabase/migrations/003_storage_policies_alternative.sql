-- ============================================================================
-- STORAGE POLICIES - ALTERNATIVE APPROACH
-- ============================================================================
-- If the main 003_storage_policies.sql fails with permission errors,
-- use this alternative approach.
--
-- Prerequisites:
-- 1. Bucket "session-recordings" must exist (created via Dashboard)
-- 2. Run this in Supabase Dashboard SQL Editor
-- ============================================================================

-- Verify bucket exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets WHERE id = 'session-recordings'
  ) THEN
    RAISE EXCEPTION 'Storage bucket "session-recordings" does not exist. Please create it via Supabase Dashboard first.';
  END IF;
END $$;

-- ============================================================================
-- APPROACH 1: Try with DROP POLICY IF EXISTS
-- ============================================================================

DO $$
BEGIN
  -- Drop existing policies (ignore errors if they don't exist)
  BEGIN
    DROP POLICY IF EXISTS "Users can download own recordings" ON storage.objects;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  BEGIN
    DROP POLICY IF EXISTS "Service role can upload" ON storage.objects;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  BEGIN
    DROP POLICY IF EXISTS "Public can view thumbnails" ON storage.objects;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  BEGIN
    DROP POLICY IF EXISTS "Service role full access" ON storage.objects;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  BEGIN
    DROP POLICY IF EXISTS "Users can delete own recordings" ON storage.objects;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END $$;

-- ============================================================================
-- Create Storage Policies
-- ============================================================================

-- Policy 1: Authenticated users can download their own recordings
CREATE POLICY "Users can download own recordings"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'session-recordings'
  AND (
    -- User owns the session (extract session ID from file path)
    EXISTS (
      SELECT 1 FROM public.sessions
      WHERE
        -- Path format: guac/{sessionId}.guac
        id::text = regexp_replace(name, '^guac/(.+)\.guac$', '\1')
        AND client_user_id = auth.uid()
    )
    OR
    -- User is admin (can access all recordings)
    EXISTS (
      SELECT 1 FROM public.auditor_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
);

-- Policy 2: Service role (backend) can upload files
CREATE POLICY "Service role can upload"
ON storage.objects FOR INSERT
TO service_role
WITH CHECK (bucket_id = 'session-recordings');

-- Policy 3: Public can view thumbnails (for dashboard previews)
CREATE POLICY "Public can view thumbnails"
ON storage.objects FOR SELECT
TO public
USING (
  bucket_id = 'session-recordings'
  AND name LIKE 'thumbnails/%'
);

-- Policy 4: Service role has full access (upload, download, delete)
CREATE POLICY "Service role full access"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'session-recordings');

-- Policy 5: Users and admins can delete their own recordings
CREATE POLICY "Users can delete own recordings"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'session-recordings'
  AND (
    -- User owns the session
    EXISTS (
      SELECT 1 FROM public.sessions
      WHERE
        id::text = regexp_replace(name, '^guac/(.+)\.guac$', '\1')
        AND client_user_id = auth.uid()
    )
    OR
    -- User is admin
    EXISTS (
      SELECT 1 FROM public.auditor_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
);

-- Verify policies were created
SELECT 'Storage policies created successfully!' as status,
       COUNT(*) as policy_count
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND policyname IN (
    'Users can download own recordings',
    'Service role can upload',
    'Public can view thumbnails',
    'Service role full access',
    'Users can delete own recordings'
  );
