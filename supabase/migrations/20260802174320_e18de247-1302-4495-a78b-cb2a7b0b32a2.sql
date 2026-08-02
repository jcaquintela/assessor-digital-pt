ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_goals text,
  ADD COLUMN IF NOT EXISTS onboarding_stage text NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS onboarding_offers integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS onboarding_last_offer_at timestamptz;