ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS source_lead_id uuid NULL;

ALTER TABLE public.opportunities
  ADD CONSTRAINT opportunities_source_lead_id_fkey
  FOREIGN KEY (source_lead_id) REFERENCES public.prospecting_leads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_opportunities_source_lead_id
  ON public.opportunities (source_lead_id) WHERE source_lead_id IS NOT NULL;

-- Backfill: apenas onde existe um follow_up do mesmo consultor a ligar
-- inequivocamente um lead a uma oportunidade (uma só origem candidata).
WITH pares AS (
  SELECT f.opportunity_id, min(f.related_prospecting_lead_id::text)::uuid AS lead_id
  FROM public.follow_ups f
  JOIN public.opportunities o ON o.id = f.opportunity_id AND o.user_id = f.user_id
  JOIN public.prospecting_leads l ON l.id = f.related_prospecting_lead_id AND l.user_id = f.user_id
  WHERE f.opportunity_id IS NOT NULL
    AND f.related_prospecting_lead_id IS NOT NULL
  GROUP BY f.opportunity_id
  HAVING count(DISTINCT f.related_prospecting_lead_id) = 1
)
UPDATE public.opportunities o
   SET source_lead_id = p.lead_id
  FROM pares p
 WHERE o.id = p.opportunity_id
   AND o.source_lead_id IS NULL;