-- A limpeza anterior não contou related_prospecting_lead_id como contexto
-- comercial. Corrigimos apenas as linhas que ela marcou como internas e que
-- estão ligadas a uma lead; títulos inequivocamente internos permanecem assim.
UPDATE public.follow_ups
SET event_class = 'negocio'
WHERE event_class = 'interno'
  AND related_prospecting_lead_id IS NOT NULL
  AND NOT (
    lower(public.text_norm(coalesce(title, ''))) ~ '(^|[^a-z0-9])(reuniao de equipa|reuniao interna|reuniao de operacoes|operacoes|lideranca|equipa|interno|interna|1:1|one on one|daily|standup|stand up|alinhamento|briefing interno|reuniao geral|plenario|administrativo|administrativa|backoffice|back office|formacao interna|onboarding interno)([^a-z0-9]|$)'
  );