ALTER TABLE public.consultant_preferences
  ADD COLUMN IF NOT EXISTS evening_review_detail text NOT NULL DEFAULT 'normal';

ALTER TABLE public.consultant_preferences
  DROP CONSTRAINT IF EXISTS consultant_preferences_evening_review_detail_check;

ALTER TABLE public.consultant_preferences
  ADD CONSTRAINT consultant_preferences_evening_review_detail_check
  CHECK (evening_review_detail IN ('curto','normal','detalhado'));