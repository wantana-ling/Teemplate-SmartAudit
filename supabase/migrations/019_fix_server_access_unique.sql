-- Fix: Allow multiple group-based access records per server
-- The NULLS NOT DISTINCT constraint prevents multiple rows with user_id=NULL
-- which blocks having multiple departments (groups) per server.

ALTER TABLE server_access DROP CONSTRAINT IF EXISTS server_access_server_id_user_id_key;
ALTER TABLE server_access ADD CONSTRAINT server_access_server_id_user_id_key UNIQUE NULLS DISTINCT (server_id, user_id);
