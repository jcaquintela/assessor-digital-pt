ALTER TABLE public.consultant_preferences
  ADD COLUMN IF NOT EXISTS reminder_lead_minutes integer;

ALTER TABLE public.consultant_preferences
  ADD CONSTRAINT consultant_preferences_reminder_lead_minutes_check
  CHECK (reminder_lead_minutes IS NULL OR (reminder_lead_minutes >= 0 AND reminder_lead_minutes <= 240));

CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value_int integer,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_settings_read" ON public.app_settings;
CREATE POLICY "app_settings_read" ON public.app_settings
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "app_settings_admin_write" ON public.app_settings;
CREATE POLICY "app_settings_admin_write" ON public.app_settings
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

INSERT INTO public.app_settings (key, value_int)
VALUES ('reminder_lead_minutes', 0)
ON CONFLICT (key) DO NOTHING;