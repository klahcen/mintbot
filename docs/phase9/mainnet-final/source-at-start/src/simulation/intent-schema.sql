-- Dedicated Phase 6 research-intent database. No funded execution states exist.
CREATE TABLE IF NOT EXISTS simulation_budget (
 scope text NOT NULL, asset text NOT NULL,
 capacity numeric(78,0) NOT NULL CHECK(capacity>=0),
 reserved numeric(78,0) NOT NULL DEFAULT 0 CHECK(reserved>=0 AND reserved<=capacity),
 PRIMARY KEY(scope,asset)
);
CREATE TABLE IF NOT EXISTS simulation_intent (
 id text PRIMARY KEY CHECK(id ~ '^[0-9a-f]{64}$'),
 opportunity text NOT NULL, strategy text NOT NULL, side text NOT NULL CHECK(side IN ('buy','sell')),
 generation text NOT NULL, wallet text NOT NULL, payload_hash text NOT NULL,
 reservation jsonb NOT NULL, scope text NOT NULL,
 status text NOT NULL CHECK(status IN ('RESERVED','BUILT','SIMULATED','POLICY_APPROVED','FAILED','CANCELLED','UNCERTAIN','MANUAL_REVIEW')),
 owner text, fence bigint NOT NULL DEFAULT 0 CHECK(fence>=0), lease_until timestamptz,
 data jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(opportunity,strategy,side,generation,wallet)
);
CREATE TABLE IF NOT EXISTS simulation_intent_audit (
 sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 intent text NOT NULL REFERENCES simulation_intent(id),
 at timestamptz NOT NULL DEFAULT clock_timestamp(),
 status text NOT NULL, owner text, fence bigint NOT NULL, data jsonb NOT NULL,
 transaction_id bigint NOT NULL DEFAULT txid_current()
);
CREATE OR REPLACE FUNCTION simulation_intent_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF ROW(NEW.id,NEW.opportunity,NEW.strategy,NEW.side,NEW.generation,NEW.wallet,NEW.payload_hash,NEW.reservation,NEW.scope)
    IS DISTINCT FROM ROW(OLD.id,OLD.opportunity,OLD.strategy,OLD.side,OLD.generation,OLD.wallet,OLD.payload_hash,OLD.reservation,OLD.scope)
    THEN RAISE EXCEPTION 'Immutable intent identity/reservation'; END IF;
  IF NEW.fence<OLD.fence THEN RAISE EXCEPTION 'Regressing fence'; END IF;
  IF NEW.status<>OLD.status AND NOT (
   (OLD.status='RESERVED' AND NEW.status='BUILT') OR
   (OLD.status='BUILT' AND NEW.status='SIMULATED') OR
   (OLD.status='SIMULATED' AND NEW.status='POLICY_APPROVED') OR
   (OLD.status NOT IN ('FAILED','CANCELLED') AND NEW.status IN ('UNCERTAIN','MANUAL_REVIEW','FAILED','CANCELLED'))
  ) THEN RAISE EXCEPTION 'Unreachable intent transition'; END IF;
 END IF;
 IF NEW.status IN ('SIMULATED','POLICY_APPROVED') AND NOT coalesce((NEW.data->'simulation'->>'success')='true' AND (NEW.data->'simulation'->>'submitted')='false',false)
  THEN RAISE EXCEPTION 'Successful read-only simulation evidence required'; END IF;
 IF NEW.status='POLICY_APPROVED' AND NOT coalesce((NEW.data->'accounting'->>'consistent')='true' AND (NEW.data->>'liveAuthorized')='false'
  AND (NEW.data->'policy'->>'kind')='simulation-policy' AND (NEW.data->'policy'->>'messageDigest')=(NEW.data->'plan'->>'messageDigest')
  AND (NEW.data->'simulation'->>'messageDigest')=(NEW.data->'plan'->>'messageDigest'),false)
  THEN RAISE EXCEPTION 'Serialized policy and accounting approval required'; END IF;
 NEW.updated_at=clock_timestamp(); RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS simulation_guard ON simulation_intent;
CREATE TRIGGER simulation_guard BEFORE INSERT OR UPDATE ON simulation_intent FOR EACH ROW EXECUTE FUNCTION simulation_intent_guard();
CREATE OR REPLACE FUNCTION simulation_intent_audit_write() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO simulation_intent_audit(intent,status,owner,fence,data)
 VALUES(NEW.id,NEW.status,NEW.owner,NEW.fence,NEW.data);
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS simulation_audit ON simulation_intent;
CREATE TRIGGER simulation_audit AFTER INSERT OR UPDATE ON simulation_intent FOR EACH ROW EXECUTE FUNCTION simulation_intent_audit_write();
