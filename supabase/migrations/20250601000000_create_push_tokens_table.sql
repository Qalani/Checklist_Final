-- Push device tokens for Firebase Cloud Messaging (FCM).
-- One row per (user, device). Tokens are upserted on each app launch and
-- deleted when the user signs out.
CREATE TABLE IF NOT EXISTS push_tokens (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid        REFERENCES auth.users (id) ON DELETE CASCADE NOT NULL,
  token      text        NOT NULL,
  platform   text        NOT NULL DEFAULT 'android',
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (user_id, token)
);

ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

-- Users can only read and write their own tokens.
CREATE POLICY "Users can manage their own push tokens"
  ON push_tokens
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service-role lookups when sending notifications.
CREATE INDEX IF NOT EXISTS push_tokens_user_id_idx ON push_tokens (user_id);
