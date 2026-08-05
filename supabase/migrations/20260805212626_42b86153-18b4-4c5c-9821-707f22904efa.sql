ALTER TABLE public.people ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.follow_ups ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.financial_movements ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.interactions ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.miscellaneous_items ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS people_user_active_idx ON public.people (user_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS properties_user_active_idx ON public.properties (user_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS follow_ups_user_active_idx ON public.follow_ups (user_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS financial_movements_user_active_idx ON public.financial_movements (user_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS interactions_user_active_idx ON public.interactions (user_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS miscellaneous_items_user_active_idx ON public.miscellaneous_items (user_id) WHERE archived_at IS NULL;