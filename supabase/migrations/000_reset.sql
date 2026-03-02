-- ============================================================================
-- RESET SCRIPT - Development Only
-- ============================================================================
-- WARNING: This script deletes ALL data and resets the database to empty state
-- Only use this during development when you want to start completely fresh
--
-- Usage:
-- 1. Run this script in Supabase SQL Editor
-- 2. Manually delete storage bucket via Dashboard (or see note at bottom)
-- 3. Then run all migrations in order, or use reduced_migrations/
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
-- STEP 2: Drop all views
-- ============================================================================
DROP VIEW IF EXISTS public.storage_dashboard CASCADE;
DROP VIEW IF EXISTS public.active_sessions CASCADE;
DROP VIEW IF EXISTS public.session_statistics CASCADE;
DROP VIEW IF EXISTS public.active_bans CASCADE;
DROP VIEW IF EXISTS public.users_with_permissions CASCADE;

-- ============================================================================
-- STEP 3: Drop all tables (CASCADE removes dependencies)
-- ============================================================================
-- Order: child/junction tables first, then parent tables

-- From 013: risk profiles
DROP TABLE IF EXISTS public.user_risk_profiles CASCADE;
DROP TABLE IF EXISTS public.server_risk_profiles CASCADE;

-- From 012: user bans
DROP TABLE IF EXISTS public.user_bans CASCADE;

-- From 008: access control & groups
DROP TABLE IF EXISTS public.server_access CASCADE;
DROP TABLE IF EXISTS public.user_groups CASCADE;
DROP TABLE IF EXISTS public.groups CASCADE;

-- From 008: risk alerts, audit, tokens, settings
DROP TABLE IF EXISTS public.risk_alerts CASCADE;
DROP TABLE IF EXISTS public.session_tokens CASCADE;
DROP TABLE IF EXISTS public.audit_log CASCADE;
DROP TABLE IF EXISTS public.system_settings CASCADE;

-- From 014: role permissions
DROP TABLE IF EXISTS public.role_permissions CASCADE;

-- From 001: video exports, sessions, servers, profiles
DROP TABLE IF EXISTS public.video_export_jobs CASCADE;
DROP TABLE IF EXISTS public.sessions CASCADE;
DROP TABLE IF EXISTS public.servers CASCADE;
DROP TABLE IF EXISTS public.auditor_profiles CASCADE;

-- From 001 (old audit_logs table name)
DROP TABLE IF EXISTS public.audit_logs CASCADE;

-- From 007: legacy tables
DROP TABLE IF EXISTS public.server_permissions CASCADE;
DROP TABLE IF EXISTS public.user_group_members CASCADE;
DROP TABLE IF EXISTS public.client_users CASCADE;

-- Users last (most things reference it)
DROP TABLE IF EXISTS public.users CASCADE;

-- ============================================================================
-- STEP 4: Drop all functions
-- ============================================================================
-- Utility / trigger functions
DROP FUNCTION IF EXISTS public.update_updated_at() CASCADE;
DROP FUNCTION IF EXISTS public.update_servers_updated_at() CASCADE;
DROP FUNCTION IF EXISTS public.update_sessions_updated_at() CASCADE;
DROP FUNCTION IF EXISTS public.update_risk_profiles_on_session_end() CASCADE;

-- Storage monitoring functions (from 004)
DROP FUNCTION IF EXISTS public.get_storage_usage() CASCADE;
DROP FUNCTION IF EXISTS public.check_file_size_limit(BIGINT) CASCADE;
DROP FUNCTION IF EXISTS public.get_largest_files(INTEGER) CASCADE;
DROP FUNCTION IF EXISTS public.cleanup_old_storage() CASCADE;
DROP FUNCTION IF EXISTS public.cleanup_expired_video_exports() CASCADE;

-- Storage helper functions (from 003)
DROP FUNCTION IF EXISTS public.generate_recording_url(UUID, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS public.can_access_recording(UUID, UUID) CASCADE;

-- Access control functions (from 008, 012, 013, 014)
DROP FUNCTION IF EXISTS public.user_has_server_access(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.is_user_banned(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.lift_user_ban(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.recalculate_user_risk_profile(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.recalculate_server_risk_profile(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.user_has_permission(UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.get_role_permissions(TEXT) CASCADE;

-- Legacy cleanup function (if exists)
DROP FUNCTION IF EXISTS public.cleanup_old_recordings() CASCADE;

-- ============================================================================
-- STEP 5: Drop all rules
-- ============================================================================
DROP RULE IF EXISTS audit_logs_immutable_update ON public.audit_logs;
DROP RULE IF EXISTS audit_logs_immutable_delete ON public.audit_logs;

-- ============================================================================
-- STEP 6: Clean up storage bucket (MANUAL STEP REQUIRED)
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
  '2. Run all migrations in order (001-018)' as step_2,
  '3. Or use reduced_migrations/ for a clean install' as step_3;
