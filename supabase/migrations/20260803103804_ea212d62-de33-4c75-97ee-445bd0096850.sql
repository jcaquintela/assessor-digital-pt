ALTER TABLE public.interactions ADD COLUMN IF NOT EXISTS is_confidential boolean NOT NULL DEFAULT false;
ALTER TABLE public.miscellaneous_items ADD COLUMN IF NOT EXISTS is_confidential boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS interactions_user_confidential_idx ON public.interactions (user_id, is_confidential);