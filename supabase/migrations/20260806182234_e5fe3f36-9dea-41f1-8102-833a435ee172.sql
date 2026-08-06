ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS password_set_at timestamptz,
  ADD COLUMN IF NOT EXISTS password_prompt_skipped_at timestamptz;