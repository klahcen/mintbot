-- Additive migration; cannot authorize signing or submission.
CREATE OR REPLACE FUNCTION simulation_append_only_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Append-only execution audit: mutation forbidden'; END $$;
CREATE TRIGGER simulation_audit_no_mutation BEFORE UPDATE OR DELETE ON simulation_intent_audit
 FOR EACH ROW EXECUTE FUNCTION simulation_append_only_guard();
CREATE TRIGGER simulation_audit_no_truncate BEFORE TRUNCATE ON simulation_intent_audit
 FOR EACH STATEMENT EXECUTE FUNCTION simulation_append_only_guard();
CREATE TRIGGER simulation_intent_no_delete BEFORE DELETE ON simulation_intent
 FOR EACH ROW EXECUTE FUNCTION simulation_append_only_guard();
CREATE TRIGGER simulation_intent_no_truncate BEFORE TRUNCATE ON simulation_intent
 FOR EACH STATEMENT EXECUTE FUNCTION simulation_append_only_guard();
CREATE OR REPLACE FUNCTION simulation_owner_fence_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.owner IS DISTINCT FROM OLD.owner AND NEW.fence<=OLD.fence
 THEN RAISE EXCEPTION 'Ownership change requires increasing fence'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER simulation_owner_fence BEFORE UPDATE ON simulation_intent
 FOR EACH ROW EXECUTE FUNCTION simulation_owner_fence_guard();
-- The migration owner owns this narrowly scoped trigger function. Runtime receives no audit writes.
ALTER FUNCTION simulation_intent_audit_write() SECURITY DEFINER;
ALTER FUNCTION simulation_intent_audit_write() SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION simulation_intent_audit_write() FROM PUBLIC;
REVOKE ALL ON FUNCTION simulation_append_only_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION simulation_owner_fence_guard() FROM PUBLIC;
REVOKE ALL ON simulation_intent_audit,simulation_schema_migration FROM PUBLIC;
