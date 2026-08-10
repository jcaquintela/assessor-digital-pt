ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS stripe_price_id text,
  ADD COLUMN IF NOT EXISTS billing_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS billing_source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS billing_environment text NOT NULL DEFAULT 'sandbox';

CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer ON public.profiles(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_subscription ON public.profiles(stripe_subscription_id);

CREATE OR REPLACE FUNCTION public.profiles_validate_billing()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.billing_status NOT IN ('none','trialing','active','past_due','canceled') THEN
    RAISE EXCEPTION 'estado de cobranca invalido: %', NEW.billing_status;
  END IF;
  IF NEW.billing_source NOT IN ('manual','stripe') THEN
    RAISE EXCEPTION 'origem de cobranca invalida: %', NEW.billing_source;
  END IF;
  IF NEW.billing_environment NOT IN ('sandbox','live') THEN
    RAISE EXCEPTION 'ambiente de cobranca invalido: %', NEW.billing_environment;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_validate_billing ON public.profiles;
CREATE TRIGGER profiles_validate_billing
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_validate_billing();

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  environment text NOT NULL DEFAULT 'sandbox',
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  outcome text NOT NULL DEFAULT 'processed',
  detail text,
  processed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.stripe_webhook_events TO authenticated;
GRANT ALL ON public.stripe_webhook_events TO service_role;

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins podem ver eventos de pagamento"
  ON public.stripe_webhook_events FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_stripe_events_profile ON public.stripe_webhook_events(profile_id, processed_at DESC);