ALTER TABLE public.calendar_event_links
  ADD COLUMN IF NOT EXISTS series_master_id text,
  ADD COLUMN IF NOT EXISTS recurrence_type text;

CREATE INDEX IF NOT EXISTS calendar_event_links_series_idx
  ON public.calendar_event_links (user_id, provider, series_master_id);