-- ============================================================================
-- Preserve session history when servers are deleted
-- ============================================================================
-- Problem: sessions.server_id has ON DELETE CASCADE, so deleting a server
-- destroys all session history. Auditors need to retain session records.
--
-- Fix: Add denormalized server info columns, backfill from existing data,
-- change FK to ON DELETE SET NULL so sessions survive server deletion.

-- 1. Add denormalized server info columns
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS server_name TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS server_host TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS server_protocol TEXT;

-- 2. Backfill from existing server data
UPDATE sessions s
SET
  server_name = srv.name,
  server_host = srv.host,
  server_protocol = srv.protocol
FROM servers srv
WHERE s.server_id = srv.id
  AND s.server_name IS NULL;

-- 3. Change FK from ON DELETE CASCADE to ON DELETE SET NULL
ALTER TABLE sessions ALTER COLUMN server_id DROP NOT NULL;
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_server_id_fkey;
ALTER TABLE sessions
  ADD CONSTRAINT sessions_server_id_fkey
  FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE SET NULL;
