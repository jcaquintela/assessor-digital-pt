ALTER TABLE public.email_drafts
  ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT (now() + interval '6 hours'),
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS sent_body text,
  ADD COLUMN IF NOT EXISTS in_reply_to_message_id text,
  ADD COLUMN IF NOT EXISTS revisions integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS confirmation_text text,
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'dashboard',
  ADD COLUMN IF NOT EXISTS to_name text,
  ADD COLUMN IF NOT EXISTS person_id uuid REFERENCES public.people(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS email_drafts_user_recent_idx
  ON public.email_drafts (user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.email_drafts TO authenticated;
GRANT ALL ON public.email_drafts TO service_role;