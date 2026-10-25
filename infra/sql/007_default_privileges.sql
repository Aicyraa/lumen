-- Phase DB review fix: Supabase grants its Data API roles privileges on new objects by default. Take them away for
-- the sequences (006 handled the tables and views that existed then) and for anything created later by this role.
-- Only where the roles exist (Supabase); schema USAGE is kept, Supabase needs it. Safe to run twice.
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', r);    -- application tables, views, schema_migrations
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', r); -- chunks_id_seq, model_calls_id_seq
    END IF;
  END LOOP;
END $$;
