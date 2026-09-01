ALTER TABLE public.routines
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'follow_up',
  ADD COLUMN IF NOT EXISTS digest_query text;

ALTER TABLE public.routines
  DROP CONSTRAINT IF EXISTS routines_kind_check;
ALTER TABLE public.routines
  ADD CONSTRAINT routines_kind_check CHECK (kind IN ('follow_up','digest'));