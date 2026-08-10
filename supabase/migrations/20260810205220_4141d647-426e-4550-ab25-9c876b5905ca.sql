ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS billing_manual_lock boolean NOT NULL DEFAULT false;