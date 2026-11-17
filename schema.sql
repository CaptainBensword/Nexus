CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  username text NOT NULL,
  username_norm text NOT NULL UNIQUE,
  email text NOT NULL,
  email_norm text NOT NULL UNIQUE,
  display_name text NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  is_online boolean NOT NULL DEFAULT false
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_online boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS friend_requests (
  id uuid PRIMARY KEY,
  sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(sender_id, receiver_id),
  CHECK(sender_id <> receiver_id)
);
CREATE INDEX IF NOT EXISTS friend_requests_receiver_idx ON friend_requests(receiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS friend_requests_sender_idx ON friend_requests(sender_id, created_at DESC);

CREATE TABLE IF NOT EXISTS friendships (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id, friend_id),
  CHECK(user_id <> friend_id)
);

CREATE TABLE IF NOT EXISTS blocked_users (
  blocker_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(blocker_id, blocked_id),
  CHECK(blocker_id <> blocked_id)
);

CREATE TABLE IF NOT EXISTS user_reports (
  id uuid PRIMARY KEY,
  reporter_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  chamber_id uuid,
  message_id bigint,
  reason text NOT NULL,
  details text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chambers (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  emoji text NOT NULL DEFAULT '🏠',
  is_public boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chambers_public_idx ON chambers(is_public, created_at DESC);

CREATE TABLE IF NOT EXISTS chamber_members (
  chamber_id uuid NOT NULL REFERENCES chambers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner','moderator','member')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(chamber_id, user_id)
);
CREATE INDEX IF NOT EXISTS chamber_members_user_idx ON chamber_members(user_id, joined_at DESC);

CREATE TABLE IF NOT EXISTS pockets (
  id uuid PRIMARY KEY,
  chamber_id uuid NOT NULL REFERENCES chambers(id) ON DELETE CASCADE,
  name text NOT NULL,
  emoji text NOT NULL DEFAULT '💬',
  topic text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(chamber_id, name)
);
CREATE INDEX IF NOT EXISTS pockets_chamber_idx ON pockets(chamber_id, sort_order, created_at);

CREATE TABLE IF NOT EXISTS pocket_messages (
  id bigserial PRIMARY KEY,
  pocket_id uuid NOT NULL REFERENCES pockets(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pocket_messages_history_idx ON pocket_messages(pocket_id, id DESC);

CREATE TABLE IF NOT EXISTS chamber_invites (
  code text PRIMARY KEY,
  chamber_id uuid NOT NULL REFERENCES chambers(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  max_uses integer NOT NULL DEFAULT 50,
  uses integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dm_conversations (
  id uuid PRIMARY KEY,
  user_one uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_two uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(user_one < user_two),
  UNIQUE(user_one, user_two)
);
CREATE TABLE IF NOT EXISTS dm_messages (
  id bigserial PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES dm_conversations(id) ON DELETE CASCADE,
  sender_id uuid REFERENCES users(id) ON DELETE SET NULL,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dm_messages_history_idx ON dm_messages(conversation_id, id DESC);
