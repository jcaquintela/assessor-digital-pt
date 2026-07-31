ALTER TABLE public.consultant_preferences
  ADD COLUMN IF NOT EXISTS proactive_push_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS evening_checkin_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS evening_checkin_time time without time zone NOT NULL DEFAULT '18:00:00';