-- ============================================================================
-- RESET SCRIPT - Development Only
-- ============================================================================
-- WARNING: This script deletes ALL data and resets the database to empty state
-- Only use this during development when you want to start completely fresh
--
-- Usage:
-- 1. Run this script in Supabase SQL Editor
-- 2. Manually delete storage bucket via Dashboard (or see note at bottom)
-- 3. Then run migrations 001, 002, 003_alternative, 004 in order
-- ============================================================================

-- ============================================================================
-- STEP 1: Drop all storage policies
-- ============================================================================
DROP POLICY IF EXISTS "Users can download own recordings" ON storage.objects;
DROP POLICY IF EXISTS "Service role can upload" ON storage.objects;
DROP POLICY IF EXISTS "Public can view thumbnails" ON storage.objects;
DROP POLICY IF EXISTS "Service role full access" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own recordings" ON storage.objects;

-- ============================================================================
-- STEP 2: Drop all RLS policies on tables
-- ============================================================================

-- Policies on auditor_profiles
DROP POLICY IF EXISTS "Users can view own profile" ON public.auditor_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.auditor_profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.auditor_profiles;
DROP POLICY IF EXISTS "Service role full access to profiles" ON public.auditor_profiles;

-- Policies on servers
DROP POLICY IF EXISTS "Authenticated users can view active servers" ON public.servers;
DROP POLICY IF EXISTS "Admins can manage servers" ON public.servers;
DROP POLICY IF EXISTS "Service role full access to servers" ON public.servers;

-- Policies on sessions
DROP POLICY IF EXISTS "Users can view own sessions" ON public.sessions;
DROP POLICY IF EXISTS "Admins can view all sessions" ON public.sessions;
DROP POLICY IF EXISTS "Service role full access to sessions" ON public.sessions;

-- Policies on video_export_jobs
DROP POLICY IF EXISTS "Users can view own export jobs" ON public.video_export_jobs;
DROP POLICY IF EXISTS "Admins can view all export jobs" ON public.video_export_jobs;
DROP POLICY IF EXISTS "Service role full access to export jobs" ON public.video_export_jobs;

-- Policies on audit_logs
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Service role can insert audit logs" ON public.audit_logs;

-- ============================================================================
-- STEP 3: Drop all views
-- ============================================================================
DROP VIEW IF EXISTS public.storage_dashboard CASCADE;
DROP VIEW IF EXISTS public.active_sessions CASCADE;
DROP VIEW IF EXISTS public.session_statistics CASCADE;

-- ============================================================================
-- STEP 4: Drop all tables (CASCADE removes dependencies)
-- ============================================================================
-- Order: child tables first to avoid foreign key conflicts
DROP TABLE IF EXISTS public.audit_logs CASCADE;
DROP TABLE IF EXISTS public.video_export_jobs CASCADE;
DROP TABLE IF EXISTS public.sessions CASCADE;
DROP TABLE IF EXISTS public.servers CASCADE;
DROP TABLE IF EXISTS public.auditor_profiles CASCADE;

-- ============================================================================
-- STEP 5: Drop all functions
-- ============================================================================
-- Utility functions
DROP FUNCTION IF EXISTS public.update_updated_at() CASCADE;

-- Storage monitoring functions (from 004_storage_monitoring.sql)
DROP FUNCTION IF EXISTS public.get_storage_usage() CASCADE;
DROP FUNCTION IF EXISTS public.check_file_size_limit(BIGINT) CASCADE;
DROP FUNCTION IF EXISTS public.get_largest_files(INTEGER) CASCADE;
DROP FUNCTION IF EXISTS public.cleanup_old_storage() CASCADE;
DROP FUNCTION IF EXISTS public.cleanup_expired_video_exports() CASCADE;

-- Storage helper functions (from 003_storage_policies.sql)
DROP FUNCTION IF EXISTS public.generate_recording_url(UUID, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS public.can_access_recording(UUID, UUID) CASCADE;

-- Legacy cleanup function (if exists)
DROP FUNCTION IF EXISTS public.cleanup_old_recordings() CASCADE;

-- ============================================================================
-- STEP 6: Drop all rules
-- ============================================================================
DROP RULE IF EXISTS audit_logs_immutable_update ON public.audit_logs;
DROP RULE IF EXISTS audit_logs_immutable_delete ON public.audit_logs;

-- ============================================================================
-- STEP 7: Clean up storage bucket (MANUAL STEP REQUIRED)
-- ============================================================================
-- Storage bucket cannot be dropped via SQL if you don't have sufficient permissions.
-- You MUST manually delete it via Supabase Dashboard:
--
-- Option 1 (Recommended): Via Dashboard
-- 1. Go to Storage → Buckets
-- 2. Click on "session-recordings" bucket
-- 3. Click "Empty bucket" (deletes all files)
-- 4. Click "Delete bucket"
--
-- Option 2: Via SQL (if you have permissions)
-- Uncomment these lines to run:
-- DELETE FROM storage.objects WHERE bucket_id = 'session-recordings';
-- DELETE FROM storage.buckets WHERE id = 'session-recordings';

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================
SELECT
  'Database reset complete!' as status,
  'Next steps:' as next_steps,
  '1. Manually delete storage bucket via Dashboard' as step_1,
  '2. Run 001_initial_schema.sql' as step_2,
  '3. Run 002_rls_policies.sql' as step_3,
  '4. Create bucket via Dashboard (private, 2GB limit)' as step_4,
  '5. Run 003_storage_policies_alternative.sql' as step_5,
  '6. Run 004_storage_monitoring.sql' as step_6;
