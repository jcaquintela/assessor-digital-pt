-- Contexto comercial é obrigatório para pedir resultado. O valor 'negocio'
-- existente é preservado por ser um override manual explícito do consultor.
UPDATE public.follow_ups
SET event_class = 'interno'
WHERE event_class IS DISTINCT FROM 'negocio'
  AND person_id IS NULL
  AND related_property_id IS NULL
  AND opportunity_id IS NULL;

-- Títulos inequivocamente internos continuam internos mesmo quando uma
-- associação foi acrescentada automaticamente.
UPDATE public.follow_ups
SET event_class = 'interno'
WHERE event_class IS DISTINCT FROM 'negocio'
  AND lower(public.text_norm(coalesce(title, ''))) ~ '(^|[^a-z0-9])(reuniao de equipa|reuniao interna|reuniao de operacoes|operacoes|lideranca|equipa|interno|interna|1:1|one on one|daily|standup|stand up|alinhamento|briefing interno|reuniao geral|plenario|administrativo|administrativa|backoffice|back office|formacao interna|onboarding interno)([^a-z0-9]|$)';

-- Um snapshot antigo não pode manter um compromisso interno nas prioridades.
UPDATE public.daily_priorities AS dp
SET dismissed_at = now()
FROM public.follow_ups AS fu
WHERE dp.user_id = fu.user_id
  AND dp.subject_type = 'follow_up'
  AND dp.subject_id = fu.id
  AND dp.dismissed_at IS NULL
  AND dp.completed_at IS NULL
  AND fu.event_class = 'interno';

INSERT INTO public.product_updates (released_on, title, description, category, is_published)
SELECT
  current_date,
  'Compromissos internos sem perguntas de resultado',
  'Reuniões e blocos de agenda sem ligação a uma pessoa, imóvel ou negócio deixam de gerar perguntas como “Como correu?”.',
  'correcao',
  true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.product_updates
  WHERE title = 'Compromissos internos sem perguntas de resultado'
);