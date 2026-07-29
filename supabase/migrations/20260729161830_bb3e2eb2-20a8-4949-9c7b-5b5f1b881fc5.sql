-- 1) profiles: novos campos
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_tier text,
  ADD COLUMN IF NOT EXISTS is_beta_tester boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS beta_expires_at timestamptz;

-- Backfill a partir de plan_tier antigo
UPDATE public.profiles
SET subscription_tier = CASE
  WHEN plan_tier IN ('consultor','pro','hub') THEN plan_tier
  WHEN plan_tier = 'pro' THEN 'pro'
  ELSE 'base'
END
WHERE subscription_tier IS NULL;

ALTER TABLE public.profiles
  ALTER COLUMN subscription_tier SET DEFAULT 'base',
  ALTER COLUMN subscription_tier SET NOT NULL,
  ADD CONSTRAINT profiles_subscription_tier_check
    CHECK (subscription_tier IN ('base','consultor','pro','hub'));

-- Remover fonte antiga
ALTER TABLE public.profiles DROP COLUMN IF EXISTS plan_tier;

-- 2) telegram_invites: renomear + normalizar valores
UPDATE public.telegram_invites SET plan_tier = 'base' WHERE plan_tier NOT IN ('base','consultor','pro','hub');
ALTER TABLE public.telegram_invites RENAME COLUMN plan_tier TO subscription_tier;
ALTER TABLE public.telegram_invites
  ALTER COLUMN subscription_tier SET DEFAULT 'base',
  ADD CONSTRAINT telegram_invites_subscription_tier_check
    CHECK (subscription_tier IN ('base','consultor','pro','hub'));

-- 3) effective_tier(): beta ativo => 'hub', senão o tier real
CREATE OR REPLACE FUNCTION public.effective_tier(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p.is_beta_tester = true
         AND (p.beta_expires_at IS NULL OR p.beta_expires_at > now())
      THEN 'hub'
    ELSE p.subscription_tier
  END
  FROM public.profiles p
  WHERE p.id = _user_id
$$;

-- Helper booleano para gating por ordem: base<consultor<pro<hub
CREATE OR REPLACE FUNCTION public.tier_at_least(_user_id uuid, _min text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE public.effective_tier(_user_id)
      WHEN 'base' THEN 0 WHEN 'consultor' THEN 1 WHEN 'pro' THEN 2 WHEN 'hub' THEN 3
      ELSE -1
    END
    >=
    CASE _min
      WHEN 'base' THEN 0 WHEN 'consultor' THEN 1 WHEN 'pro' THEN 2 WHEN 'hub' THEN 3
      ELSE 99
    END
$$;

GRANT EXECUTE ON FUNCTION public.effective_tier(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.tier_at_least(uuid, text) TO authenticated, anon;