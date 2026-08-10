ALTER TABLE public.miscellaneous_items
  ADD COLUMN IF NOT EXISTS team_read_at timestamptz,
  ADD COLUMN IF NOT EXISTS team_archived_at timestamptz;

CREATE INDEX IF NOT EXISTS miscellaneous_items_team_suggestion_idx
  ON public.miscellaneous_items (created_at DESC)
  WHERE category ILIKE 'sugest%' OR title ILIKE 'sugest%';