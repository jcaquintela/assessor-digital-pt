-- Fase 1 ACI: teto de intervenções não solicitadas + prioridade/evidência por aviso.
ALTER TABLE public.consultant_preferences
  ADD COLUMN IF NOT EXISTS max_unsolicited_nudges_per_day integer NOT NULL DEFAULT 1;

ALTER TABLE public.consultant_preferences
  DROP CONSTRAINT IF EXISTS consultant_preferences_max_unsolicited_check;
ALTER TABLE public.consultant_preferences
  ADD CONSTRAINT consultant_preferences_max_unsolicited_check
  CHECK (max_unsolicited_nudges_per_day BETWEEN 0 AND 20);

ALTER TABLE public.assessor_nudges
  ADD COLUMN IF NOT EXISTS priority integer,
  ADD COLUMN IF NOT EXISTS evidence jsonb;

-- Kill switch da entrega de oportunidades no canal. Desligar => volta o resumo agregado antigo.
INSERT INTO public.feature_flags (key, description, enabled_globally, enabled_plans, rollout_percentage)
VALUES (
  'assessor.opportunity_nudges.v1',
  'Oportunidades comerciais (match comprador-imóvel e negócio parado) entregues uma a uma no canal, com evidência e prioridade. Desligado = resumo diário agregado antigo.',
  true, '{}', 0
)
ON CONFLICT (key) DO NOTHING;