CREATE TABLE public.plan_configs (
  tier TEXT PRIMARY KEY,
  price_month NUMERIC,
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID
);

GRANT SELECT ON public.plan_configs TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plan_configs TO authenticated;
GRANT ALL ON public.plan_configs TO service_role;

ALTER TABLE public.plan_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Published plans are readable by anyone"
  ON public.plan_configs FOR SELECT
  USING (status = 'published' OR public.is_admin(auth.uid()));

CREATE POLICY "Admins manage plan configs"
  ON public.plan_configs FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

INSERT INTO public.plan_configs (tier, price_month, status, notes) VALUES
  ('base', 0, 'published', 'Telegram, grátis'),
  ('consultor', NULL, 'draft', NULL),
  ('pro', NULL, 'draft', NULL),
  ('hub', NULL, 'draft', NULL);