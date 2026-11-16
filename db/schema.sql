CREATE TABLE IF NOT EXISTS events (
  id text PRIMARY KEY,
  kind text NOT NULL,
  payload jsonb NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_observed_at ON events(observed_at DESC);
-- Future live order journal. The current paper runtime uses atomic file snapshots.
CREATE TABLE IF NOT EXISTS wallets (
  id uuid PRIMARY KEY,
  public_key text UNIQUE NOT NULL,
  vault_ref text NOT NULL,
  enabled boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS orders (
  id text PRIMARY KEY,
  wallet_id uuid REFERENCES wallets(id),
  mint text NOT NULL,
  side text NOT NULL CHECK (side IN ('buy','sell')),
  status text NOT NULL CHECK (status IN ('prepared','submitted','confirmed','failed','unresolved','expired-unobserved')),
  signature text UNIQUE,
  last_valid_block_height bigint,
  details jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS positions (
  id uuid PRIMARY KEY,
  wallet_id uuid REFERENCES wallets(id),
  mint text NOT NULL,
  quantity numeric(78,0) NOT NULL CHECK (quantity >= 0),
  cost_lamports numeric(30,0) NOT NULL CHECK (cost_lamports >= 0),
  closed_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS one_open_position ON positions(wallet_id,mint) WHERE closed_at IS NULL;
