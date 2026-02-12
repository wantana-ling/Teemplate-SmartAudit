-- ============================================================================
-- 006: Storage Bucket Policies
-- ============================================================================
-- Requires: "session-recordings" bucket created via Supabase Dashboard

-- Verify bucket exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets WHERE id = 'session-recordings'
  ) THEN
    RAISE EXCEPTION 'Storage bucket "session-recordings" does not exist. Please create it via Supabase Dashboard first.';
  END IF;
END $$;

-- Drop existing policies safely
DO $$
BEGIN
  BEGIN
    DROP POLICY IF EXISTS "Users can download own recordings" ON storage.objects;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  BEGIN
    DROP POLICY IF EXISTS "Service role can upload" ON storage.objects;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  BEGIN
    DROP POLICY IF EXISTS "Public can view thumbnails" ON storage.objects;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  BEGIN
    DROP POLICY IF EXISTS "Service role full access" ON storage.objects;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  BEGIN
    DROP POLICY IF EXISTS "Users can delete own recordings" ON storage.objects;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;

-- Policy 1: Authenticated users can download their own recordings
-- Updated to reference users table (not old auditor_profiles)
CREATE POLICY "Users can download own recordings"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'session-recordings'
  AND (
    EXISTS (
      SELECT 1 FROM public.sessions
      WHERE
        id::text = regexp_replace(name, '^guac/(.+)\.guac$', '\1')
        AND user_id = (
          SELECT u.id FROM public.users u WHERE u.id = auth.uid()
        )
    )
    OR
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  )
);

-- Policy 2: Service role (backend) can upload files
CREATE POLICY "Service role can upload"
ON storage.objects FOR INSERT
TO service_role
WITH CHECK (bucket_id = 'session-recordings');

-- Policy 3: Public can view thumbnails
CREATE POLICY "Public can view thumbnails"
ON storage.objects FOR SELECT
TO public
USING (
  bucket_id = 'session-recordings'
  AND name LIKE 'thumbnails/%'
);

-- Policy 4: Service role has full access
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
    EXISTS (
      SELECT 1 FROM public.sessions
      WHERE
        id::text = regexp_replace(name, '^guac/(.+)\.guac$', '\1')
        AND user_id = (
          SELECT u.id FROM public.users u WHERE u.id = auth.uid()
        )
    )
    OR
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  )
);
