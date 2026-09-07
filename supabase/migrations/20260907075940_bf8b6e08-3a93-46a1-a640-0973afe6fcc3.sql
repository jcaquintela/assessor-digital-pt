ALTER TABLE public.whatsapp_template_bindings
  ADD COLUMN IF NOT EXISTS fallback_template_name text;

UPDATE public.whatsapp_template_bindings
   SET template_name = 'afonso_briefing_compromisso_v2',
       param_count = 5,
       fallback_template_name = 'afonso_briefing_compromisso',
       updated_at = now()
 WHERE purpose = 'meeting_briefing';