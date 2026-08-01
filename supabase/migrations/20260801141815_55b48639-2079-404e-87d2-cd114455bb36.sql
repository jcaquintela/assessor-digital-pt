
CREATE TABLE public.content_access_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  requested_by uuid NOT NULL,
  scope text NOT NULL DEFAULT 'conversation',
  resource_id text,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  expires_at timestamptz,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.content_access_consents TO authenticated;
GRANT ALL ON public.content_access_consents TO service_role;
ALTER TABLE public.content_access_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Consultant sees own consent requests"
  ON public.content_access_consents FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "Consultant decides own consent requests"
  ON public.content_access_consents FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins create consent requests"
  ON public.content_access_consents FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()) AND requested_by = auth.uid());

CREATE INDEX idx_cac_user_status ON public.content_access_consents (user_id, status);

CREATE OR REPLACE FUNCTION public.content_access_consents_validate()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status NOT IN ('pending','approved','denied','revoked','expired') THEN
    RAISE EXCEPTION 'estado de consentimento invalido: %', NEW.status;
  END IF;
  IF NEW.status = 'approved' AND NEW.expires_at IS NULL THEN
    NEW.expires_at = now() + interval '2 hours';
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_cac_validate
  BEFORE INSERT OR UPDATE ON public.content_access_consents
  FOR EACH ROW EXECUTE FUNCTION public.content_access_consents_validate();

ALTER TABLE public.plan_configs
  ADD COLUMN IF NOT EXISTS pricing_mode text NOT NULL DEFAULT 'paid';

CREATE OR REPLACE FUNCTION public.plan_configs_validate()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.pricing_mode NOT IN ('paid','invite_only','free_beta','on_request') THEN
    RAISE EXCEPTION 'modo de preco invalido: %', NEW.pricing_mode;
  END IF;
  IF NEW.status = 'published'
     AND NEW.pricing_mode = 'paid'
     AND NEW.price_month IS NULL
     AND NEW.tier <> 'base' THEN
    RAISE EXCEPTION 'Um plano pago nao pode ficar publicado sem preco. Define o preco ou escolhe "apenas por convite", "beta gratuito" ou "preco sob consulta".';
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

UPDATE public.plan_configs
   SET status = 'draft'
 WHERE status = 'published' AND price_month IS NULL AND tier <> 'base';

CREATE TRIGGER trg_plan_configs_validate
  BEFORE INSERT OR UPDATE ON public.plan_configs
  FOR EACH ROW EXECUTE FUNCTION public.plan_configs_validate();
