ALTER TABLE public.consultant_preferences
  ADD COLUMN IF NOT EXISTS active_calendar_provider text,
  ADD COLUMN IF NOT EXISTS active_mail_provider text;

ALTER TABLE public.consultant_preferences
  DROP CONSTRAINT IF EXISTS consultant_preferences_active_calendar_provider_check;
ALTER TABLE public.consultant_preferences
  ADD CONSTRAINT consultant_preferences_active_calendar_provider_check
  CHECK (active_calendar_provider IS NULL OR active_calendar_provider IN ('google_calendar','microsoft_outlook'));

ALTER TABLE public.consultant_preferences
  DROP CONSTRAINT IF EXISTS consultant_preferences_active_mail_provider_check;
ALTER TABLE public.consultant_preferences
  ADD CONSTRAINT consultant_preferences_active_mail_provider_check
  CHECK (active_mail_provider IS NULL OR active_mail_provider IN ('gmail','outlook'));

-- Backfill email: um só ligado -> esse; dois ligados -> gmail (era o fallback de facto)
INSERT INTO public.consultant_preferences (user_id, active_mail_provider)
SELECT e.user_id,
       CASE WHEN count(*) FILTER (WHERE e.provider = 'gmail') > 0 THEN 'gmail' ELSE 'outlook' END
FROM public.email_connections e
GROUP BY e.user_id
ON CONFLICT (user_id) DO UPDATE
SET active_mail_provider = COALESCE(public.consultant_preferences.active_mail_provider, EXCLUDED.active_mail_provider);

-- Backfill calendário: só quando há exatamente um provedor ligado
INSERT INTO public.consultant_preferences (user_id, active_calendar_provider)
SELECT c.user_id, min(c.provider)
FROM public.calendar_connections c
GROUP BY c.user_id
HAVING count(DISTINCT c.provider) = 1
ON CONFLICT (user_id) DO UPDATE
SET active_calendar_provider = COALESCE(public.consultant_preferences.active_calendar_provider, EXCLUDED.active_calendar_provider);