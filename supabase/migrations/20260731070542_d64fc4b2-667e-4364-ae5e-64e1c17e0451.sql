CREATE TABLE public.telegram_pairings (
  chat_id text PRIMARY KEY,
  step text NOT NULL DEFAULT 'asked',
  target_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  phone text,
  code_hash text,
  attempts integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.telegram_pairings TO service_role;
ALTER TABLE public.telegram_pairings ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.telegram_link_tokens (
  token text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  used_chat_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.telegram_link_tokens TO authenticated;
GRANT ALL ON public.telegram_link_tokens TO service_role;
ALTER TABLE public.telegram_link_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "telegram_link_tokens_own_select" ON public.telegram_link_tokens
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE INDEX idx_telegram_link_tokens_user ON public.telegram_link_tokens (user_id);