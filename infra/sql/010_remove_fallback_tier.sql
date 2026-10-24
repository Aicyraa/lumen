-- The fallback tier was removed from the product: a tenant has the cheap and expensive tiers only (inside a tier,
-- models are still tried top to bottom). Safe to run twice; the migration tool runs it in one transaction.

-- Deletes the tenants' fallback models on purpose, including their encrypted provider keys.
DELETE FROM tenant_models WHERE tier = 'fallback';

-- The constraint name is looked up, not assumed (002 created it unnamed, so Postgres named it tenant_models_tier_check).
DO $$
DECLARE c TEXT;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'tenant_models'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%tier%'
  LOOP
    EXECUTE format('ALTER TABLE tenant_models DROP CONSTRAINT %I', c);
  END LOOP;
END $$;
ALTER TABLE tenant_models ADD CONSTRAINT tenant_models_tier_check CHECK (tier IN ('cheap', 'expensive'));

-- model_calls.tier keeps 'fallback' on purpose so historical rows stay valid; nothing writes it any more
-- (the API stores a stray 'fallback' from an old rag-service as 'default'). Positions within cheap and expensive are unaffected.
