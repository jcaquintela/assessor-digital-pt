-- 1. Fases do negócio
DO $$ BEGIN
  CREATE TYPE public.deal_stage AS ENUM (
    'preparacao','angariacao','promocao','visitas','proposta','cpcv','escritura','concluido'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Negócio (tabela opportunities) ganha os campos da nova entidade
ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS deal_kind text NOT NULL DEFAULT 'comprador',
  ADD COLUMN IF NOT EXISTS stage public.deal_stage NOT NULL DEFAULT 'preparacao',
  ADD COLUMN IF NOT EXISTS stage_changed_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS deadline timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

ALTER TABLE public.opportunities
  DROP CONSTRAINT IF EXISTS opportunities_deal_kind_check;
ALTER TABLE public.opportunities
  ADD CONSTRAINT opportunities_deal_kind_check CHECK (deal_kind IN ('comprador','vendedor'));

CREATE INDEX IF NOT EXISTS opportunities_user_stage_idx ON public.opportunities (user_id, stage);
CREATE INDEX IF NOT EXISTS opportunities_user_archived_idx ON public.opportunities (user_id, archived_at);

-- 3. Imóveis do negócio (vários por negócio)
CREATE TABLE IF NOT EXISTS public.opportunity_properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  opportunity_id uuid NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'principal',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (opportunity_id, property_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.opportunity_properties TO authenticated;
GRANT ALL ON public.opportunity_properties TO service_role;
ALTER TABLE public.opportunity_properties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "opportunity_properties_own" ON public.opportunity_properties
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS opportunity_properties_opp_idx ON public.opportunity_properties (opportunity_id);
CREATE INDEX IF NOT EXISTS opportunity_properties_prop_idx ON public.opportunity_properties (user_id, property_id);

-- 4. Histórico estruturado do negócio
CREATE TABLE IF NOT EXISTS public.opportunity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  opportunity_id uuid NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  kind text NOT NULL,
  summary text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text NOT NULL DEFAULT 'dashboard',
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.opportunity_events TO authenticated;
GRANT ALL ON public.opportunity_events TO service_role;
ALTER TABLE public.opportunity_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "opportunity_events_own" ON public.opportunity_events
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS opportunity_events_opp_idx ON public.opportunity_events (opportunity_id, occurred_at DESC);

-- 5. Documentos ligados ao negócio
ALTER TABLE public.uploaded_files
  ADD COLUMN IF NOT EXISTS opportunity_id uuid REFERENCES public.opportunities(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS uploaded_files_opportunity_idx ON public.uploaded_files (user_id, opportunity_id);

-- 6. Conversão dos negócios existentes (aditiva; imóvel já ligado passa também para a tabela de ligação)
UPDATE public.opportunities SET title = coalesce(nullif(btrim(title), ''), 'Negócio') WHERE title IS NULL OR btrim(title) = '';
INSERT INTO public.opportunity_properties (user_id, opportunity_id, property_id, role)
SELECT o.user_id, o.id, o.property_id, 'principal'
FROM public.opportunities o
WHERE o.property_id IS NOT NULL
ON CONFLICT (opportunity_id, property_id) DO NOTHING;