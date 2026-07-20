CREATE TYPE editorial_status AS ENUM ('draft', 'review', 'approved', 'rejected', 'archived');

CREATE TABLE categories (
  id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE questions (
  id uuid PRIMARY KEY,
  category_id uuid NOT NULL REFERENCES categories(id),
  prompt text NOT NULL,
  type text NOT NULL CHECK (type IN ('mcq', 'word')),
  options jsonb,
  correct_answer jsonb NOT NULL,
  accepted_answers jsonb NOT NULL DEFAULT '[]',
  difficulty smallint NOT NULL DEFAULT 1 CHECK (difficulty BETWEEN 1 AND 5),
  region text,
  language text NOT NULL DEFAULT 'es',
  fact text NOT NULL,
  source_url text,
  editorial_status editorial_status NOT NULL DEFAULT 'draft',
  times_used integer NOT NULL DEFAULT 0,
  correct_rate numeric(5,2),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE matches (
  id uuid PRIMARY KEY,
  room_code text NOT NULL,
  status text NOT NULL CHECK (status IN ('finished', 'abandoned')),
  started_at timestamptz NOT NULL,
  finished_at timestamptz NOT NULL,
  event_log jsonb NOT NULL DEFAULT '[]'
);

CREATE TABLE match_players (
  match_id uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id uuid NOT NULL,
  display_name text NOT NULL,
  score integer NOT NULL DEFAULT 0,
  position smallint NOT NULL,
  PRIMARY KEY (match_id, player_id)
);

CREATE TABLE answers (
  id uuid PRIMARY KEY,
  match_id uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id uuid NOT NULL,
  question_id uuid NOT NULL REFERENCES questions(id),
  answer jsonb NOT NULL,
  correct boolean NOT NULL,
  response_ms integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
