-- ============================================================================
-- 007: Storage Monitoring Functions and Dashboard
-- ============================================================================
-- All audit_logs references fixed to audit_log (the final table name)

-- Function to get current storage usage
CREATE OR REPLACE FUNCTION get_storage_usage()
RETURNS TABLE(
  total_size_bytes BIGINT,
  total_size_mb NUMERIC,
  total_size_gb NUMERIC,
  file_count BIGINT,
  limit_gb NUMERIC,
  usage_percent NUMERIC,
  per_file_limit_mb BIGINT,
  tier TEXT
) AS $$
DECLARE
  bucket_file_limit BIGINT;
  project_storage_limit_gb NUMERIC;
BEGIN
  SELECT file_size_limit INTO bucket_file_limit
  FROM storage.buckets
  WHERE id = 'session-recordings';

  project_storage_limit_gb := CASE
    WHEN bucket_file_limit <= 2000000000 THEN 1.0
    ELSE 100.0
  END;

  RETURN QUERY
  SELECT
    COALESCE(SUM((metadata->>'size')::BIGINT), 0)::BIGINT as total_size_bytes,
    ROUND(COALESCE(SUM((metadata->>'size')::BIGINT), 0)::NUMERIC / 1024.0 / 1024.0, 2) as total_size_mb,
    ROUND(COALESCE(SUM((metadata->>'size')::BIGINT), 0)::NUMERIC / 1024.0 / 1024.0 / 1024.0, 3) as total_size_gb,
    COUNT(*)::BIGINT as file_count,
    project_storage_limit_gb as limit_gb,
    ROUND(
      (COALESCE(SUM((metadata->>'size')::BIGINT), 0)::NUMERIC / 1024.0 / 1024.0 / 1024.0 / project_storage_limit_gb) * 100,
      2
    ) as usage_percent,
    ROUND(bucket_file_limit::NUMERIC / 1024.0 / 1024.0, 0)::BIGINT as per_file_limit_mb,
    CASE
      WHEN project_storage_limit_gb = 1.0 THEN 'free'
      ELSE 'pro'
    END as tier
  FROM storage.objects
  WHERE bucket_id = 'session-recordings';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if file exceeds per-file limit
CREATE OR REPLACE FUNCTION check_file_size_limit(file_size_bytes BIGINT)
RETURNS TABLE(
  allowed BOOLEAN,
  file_size_mb NUMERIC,
  limit_mb BIGINT,
  message TEXT
) AS $$
DECLARE
  size_mb NUMERIC;
  bucket_limit_bytes BIGINT;
  bucket_limit_mb BIGINT;
BEGIN
  SELECT file_size_limit INTO bucket_limit_bytes
  FROM storage.buckets
  WHERE id = 'session-recordings';

  bucket_limit_mb := ROUND(bucket_limit_bytes::NUMERIC / 1024.0 / 1024.0, 0)::BIGINT;
  size_mb := ROUND(file_size_bytes::NUMERIC / 1024.0 / 1024.0, 2);

  RETURN QUERY SELECT
    file_size_bytes <= bucket_limit_bytes as allowed,
    size_mb,
    bucket_limit_mb,
    CASE
      WHEN file_size_bytes <= bucket_limit_bytes THEN 'File size OK'
      ELSE 'File exceeds ' || bucket_limit_mb || ' MB bucket limit'
    END as message;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to cleanup expired video export jobs
-- Fixed: audit_logs -> audit_log
CREATE OR REPLACE FUNCTION cleanup_expired_video_exports()
RETURNS TABLE(cleaned_count INTEGER, deleted_files TEXT[]) AS $$
DECLARE
  cleaned INTEGER := 0;
  file_paths TEXT[];
BEGIN
  SELECT ARRAY_AGG(temp_file_path)
  INTO file_paths
  FROM public.video_export_jobs
  WHERE status = 'ready'
    AND expires_at < NOW()
    AND temp_file_path IS NOT NULL;

  UPDATE public.video_export_jobs
  SET status = 'expired'
  WHERE status = 'ready'
    AND expires_at < NOW();

  GET DIAGNOSTICS cleaned = ROW_COUNT;

  INSERT INTO public.audit_log (action, resource_type, details)
  VALUES (
    'video_export_cleanup',
    'system',
    jsonb_build_object(
      'cleaned_count', cleaned,
      'temp_files', file_paths,
      'timestamp', NOW()
    )
  );

  RETURN QUERY SELECT cleaned, COALESCE(file_paths, ARRAY[]::TEXT[]);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get largest files
CREATE OR REPLACE FUNCTION get_largest_files(limit_count INTEGER DEFAULT 10)
RETURNS TABLE(
  file_path TEXT,
  size_mb NUMERIC,
  created_at TIMESTAMPTZ,
  age_days INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    name as file_path,
    ROUND((metadata->>'size')::BIGINT / 1024.0 / 1024.0, 2) as size_mb,
    created_at,
    EXTRACT(DAY FROM NOW() - created_at)::INTEGER as age_days
  FROM storage.objects
  WHERE bucket_id = 'session-recordings'
  ORDER BY (metadata->>'size')::BIGINT DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Standard cleanup (90 days retention)
-- Fixed: audit_logs -> audit_log
CREATE OR REPLACE FUNCTION cleanup_old_storage()
RETURNS TABLE(deleted_count INTEGER, freed_mb NUMERIC) AS $$
DECLARE
  retention_days INTEGER := 90;
  deleted INTEGER := 0;
  freed BIGINT := 0;
BEGIN
  WITH deleted_objects AS (
    DELETE FROM storage.objects
    WHERE bucket_id = 'session-recordings'
      AND created_at < NOW() - (retention_days || ' days')::INTERVAL
      AND name NOT LIKE 'thumbnails/%'
    RETURNING (metadata->>'size')::BIGINT as size
  )
  SELECT COUNT(*), COALESCE(SUM(size), 0)
  INTO deleted, freed
  FROM deleted_objects;

  INSERT INTO public.audit_log (action, resource_type, details)
  VALUES (
    'storage_cleanup',
    'system',
    jsonb_build_object(
      'deleted_count', deleted,
      'freed_mb', ROUND(freed / 1024.0 / 1024.0, 2),
      'retention_days', retention_days,
      'timestamp', NOW()
    )
  );

  RETURN QUERY SELECT deleted, ROUND(freed / 1024.0 / 1024.0, 2);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Storage dashboard view
CREATE OR REPLACE VIEW public.storage_dashboard AS
SELECT
  u.total_size_mb,
  u.total_size_gb,
  u.limit_gb,
  u.usage_percent,
  u.file_count,
  u.per_file_limit_mb,
  u.tier,
  ROUND(u.limit_gb * 1024 - u.total_size_mb, 2) as available_mb,
  CASE
    WHEN u.usage_percent >= 95 THEN 'critical'
    WHEN u.usage_percent >= 80 THEN 'warning'
    WHEN u.usage_percent >= 60 THEN 'info'
    ELSE 'ok'
  END as status,
  CASE
    WHEN u.usage_percent >= 95 THEN 'Cleanup required - approaching storage limit'
    WHEN u.usage_percent >= 80 THEN 'Monitor usage - consider cleanup'
    WHEN u.usage_percent >= 60 THEN 'Usage normal'
    ELSE 'Storage healthy'
  END as recommendation
FROM get_storage_usage() u;

-- ============================================================================
-- Function Comments
-- ============================================================================
COMMENT ON FUNCTION get_storage_usage() IS
  'Get storage usage stats for session-recordings bucket. Dynamically detects tier based on bucket limits.';
COMMENT ON FUNCTION check_file_size_limit(BIGINT) IS
  'Check if a file size is within bucket per-file limit. Reads limit from bucket configuration.';
COMMENT ON FUNCTION get_largest_files(INTEGER) IS
  'Get largest files in session-recordings bucket for cleanup/review decisions.';
COMMENT ON FUNCTION cleanup_old_storage() IS
  'Delete .guac recordings older than 90 days. Keeps thumbnails. Logs cleanup to audit_log.';
COMMENT ON FUNCTION cleanup_expired_video_exports() IS
  'Mark expired on-demand video export jobs as expired. Returns list of /tmp files for backend to delete.';
COMMENT ON VIEW storage_dashboard IS
  'Real-time storage usage dashboard. Shows usage, limits, status, and recommendations.';
