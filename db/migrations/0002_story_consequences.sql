CREATE TABLE story_consequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('courier_trust', 'tax_grudge', 'waystone_promise')),
  status text NOT NULL CHECK (status IN ('open', 'fulfilled', 'returned', 'sold', 'refused')),
  opened_sequence integer NOT NULL CHECK (opened_sequence >= 1),
  origin_template_id integer,
  origin_choice_id text,
  closed_event_id uuid REFERENCES game_events(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX story_consequences_character_idx ON story_consequences (character_id, opened_sequence);

CREATE UNIQUE INDEX story_consequences_one_open_per_kind
  ON story_consequences (character_id, kind) WHERE status = 'open';
