CREATE TABLE characters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  namespace text NOT NULL,
  chain_id bigint,
  contract text,
  token_id text NOT NULL,
  trust integer NOT NULL DEFAULT 0 CHECK (trust >= -100 AND trust <= 100),
  notoriety integer NOT NULL DEFAULT 0 CHECK (notoriety >= 0 AND notoriety <= 100),
  supplies integer NOT NULL DEFAULT 3 CHECK (supplies >= 0 AND supplies <= 10),
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  active_epoch_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (namespace, chain_id, contract, token_id)
);

CREATE TABLE ownership_epochs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  controller_wallet text NOT NULL,
  observed_start timestamptz NOT NULL DEFAULT now(),
  observed_end timestamptz,
  verification_block bigint,
  intention text CHECK (intention IN ('embrace', 'redeem')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ownership_epochs_one_active_per_character
  ON ownership_epochs (character_id) WHERE observed_end IS NULL;

ALTER TABLE characters
  ADD CONSTRAINT characters_active_epoch_fk
  FOREIGN KEY (active_epoch_id) REFERENCES ownership_epochs(id);

CREATE TABLE game_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  epoch_id uuid NOT NULL REFERENCES ownership_epochs(id),
  actor_wallet text NOT NULL,
  sequence integer NOT NULL CHECK (sequence >= 1),
  type text NOT NULL CHECK (type IN ('game', 'ownership', 'intention')),
  template_id integer CHECK (template_id BETWEEN 0 AND 5),
  choice_id text,
  ruleset_version text NOT NULL,
  text text NOT NULL,
  before_state jsonb NOT NULL,
  after_state jsonb NOT NULL,
  title_before text NOT NULL,
  title_after text NOT NULL,
  verification_block bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (character_id, sequence)
);

CREATE INDEX game_events_character_created_idx ON game_events (character_id, created_at DESC);

CREATE TABLE daily_budgets (
  character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  utc_date date NOT NULL,
  used integer NOT NULL DEFAULT 0 CHECK (used >= 0 AND used <= 3),
  PRIMARY KEY (character_id, utc_date)
);

CREATE TABLE encounter_instances (
  id text PRIMARY KEY,
  character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  utc_date date NOT NULL,
  slot integer NOT NULL CHECK (slot BETWEEN 0 AND 2),
  template_id integer NOT NULL CHECK (template_id BETWEEN 0 AND 5),
  ruleset_version text NOT NULL,
  resolved_event_id uuid REFERENCES game_events(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (character_id, utc_date, slot)
);

CREATE TABLE action_receipts (
  character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  actor_wallet text NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (character_id, actor_wallet, idempotency_key)
);

CREATE TABLE chain_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  namespace text NOT NULL,
  chain_id bigint NOT NULL,
  contract text NOT NULL,
  token_id text NOT NULL,
  block_number bigint NOT NULL,
  block_hash text NOT NULL,
  tx_hash text NOT NULL,
  log_index integer NOT NULL,
  from_address text NOT NULL,
  to_address text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('mint', 'transfer', 'burn')),
  observed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chain_id, tx_hash, log_index)
);

CREATE INDEX chain_events_token_idx
  ON chain_events (namespace, chain_id, contract, token_id, block_number, log_index);

CREATE TABLE metadata_cache (
  namespace text NOT NULL,
  chain_id bigint NOT NULL,
  contract text NOT NULL,
  token_id text NOT NULL,
  token_uri text,
  name text,
  image_uri text,
  traits jsonb,
  error text,
  retrieved_at timestamptz NOT NULL,
  PRIMARY KEY (namespace, chain_id, contract, token_id)
);

CREATE TABLE history_sync (
  namespace text NOT NULL,
  chain_id bigint NOT NULL,
  contract text NOT NULL,
  token_id text NOT NULL,
  start_block bigint NOT NULL,
  cursor_block bigint NOT NULL,
  latest_verified_block bigint,
  status text NOT NULL DEFAULT 'partial' CHECK (status IN ('complete', 'partial', 'none')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (namespace, chain_id, contract, token_id)
);

CREATE TABLE ownership_observations (
  namespace text NOT NULL,
  chain_id bigint NOT NULL,
  contract text NOT NULL,
  token_id text NOT NULL,
  owner_address text,
  block_number bigint,
  observed_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('fresh', 'stale', 'unavailable')),
  PRIMARY KEY (namespace, chain_id, contract, token_id)
);

CREATE TABLE auth_nonces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nonce_hash text NOT NULL UNIQUE,
  wallet text NOT NULL,
  domain text NOT NULL,
  uri text NOT NULL,
  chain_id bigint NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz
);

CREATE INDEX auth_nonces_expiry_idx ON auth_nonces (expires_at);

CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  wallet text NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);

CREATE INDEX sessions_wallet_idx ON sessions (wallet);
