CREATE TABLE public.promo_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_id uuid NOT NULL REFERENCES public.promo_codes(id) ON DELETE CASCADE,
  code text NOT NULL,
  granted_tier text NOT NULL,
  channel text NOT NULL DEFAULT 'whatsapp',
  status text NOT NULL DEFAULT 'pending',
  expires_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, code_id)
);

GRANT SELECT ON public.promo_redemptions TO authenticated;
GRANT ALL ON public.promo_redemptions TO service_role;

ALTER TABLE public.promo_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "promo_redemptions_owner_select"
  ON public.promo_redemptions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX promo_redemptions_user_status_idx
  ON public.promo_redemptions (user_id, status, created_at DESC);

CREATE TRIGGER promo_redemptions_touch
  BEFORE UPDATE ON public.promo_redemptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();