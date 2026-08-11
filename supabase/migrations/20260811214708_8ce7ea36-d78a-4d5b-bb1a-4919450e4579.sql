ALTER TABLE public.follow_ups ADD COLUMN IF NOT EXISTS event_class text;

ALTER TABLE public.follow_ups DROP CONSTRAINT IF EXISTS follow_ups_event_class_chk;
ALTER TABLE public.follow_ups ADD CONSTRAINT follow_ups_event_class_chk
  CHECK (event_class IS NULL OR event_class IN ('negocio','interno'));

-- Retroativo: compromissos claramente internos deixam de ser tratados como
-- seguimentos pendentes. Nada é apagado — só reclassificado.
UPDATE public.follow_ups
SET event_class = 'interno'
WHERE event_class IS NULL
  AND (
    lower(public.text_norm(coalesce(title,''))) ~ '(^|[^a-z0-9])(reuniao de equipa|reuniao interna|reuniao de operacoes|operacoes|lideranca|equipa|interno|interna|1:1|one on one|daily|standup|stand-up|alinhamento|ponto de situacao interno|formacao interna|administrativo)([^a-z0-9]|$)'
  );