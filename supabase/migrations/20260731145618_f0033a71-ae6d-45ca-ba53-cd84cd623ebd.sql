CREATE TABLE public.dashboard_login_tokens (
  token text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'telegram',
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_dashboard_login_tokens_user ON public.dashboard_login_tokens (user_id);
GRANT ALL ON public.dashboard_login_tokens TO service_role;
ALTER TABLE public.dashboard_login_tokens ENABLE ROW LEVEL SECURITY;