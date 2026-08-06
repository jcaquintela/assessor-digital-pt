ALTER TABLE public.dashboard_login_tokens
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS issued_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;