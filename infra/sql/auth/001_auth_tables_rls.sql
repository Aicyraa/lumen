-- Better Auth's own tables: row level security with no policies, and no Data API access. Run AFTER Better Auth has created
-- its tables (auth:migrate does it right after runMigrations(); on Supabase run this file after Better Auth's tables).
-- Only the tables that exist, only the roles that exist. Safe to run twice.
DO $$
DECLARE t text; r text;
BEGIN
  FOREACH t IN ARRAY ARRAY['user', 'session', 'account', 'verification', 'organization', 'member', 'invitation', 'apikey'] LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
          EXECUTE format('REVOKE ALL ON public.%I FROM %I', t, r);
        END IF;
      END LOOP;
    END IF;
  END LOOP;
END $$;
