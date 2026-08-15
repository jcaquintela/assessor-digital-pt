ALTER TABLE public.email_messages
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'gmail';

ALTER TABLE public.email_drafts
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'gmail';

UPDATE public.email_messages SET provider = 'gmail' WHERE provider IS NULL;
UPDATE public.email_drafts SET provider = 'gmail' WHERE provider IS NULL;

ALTER TABLE public.email_messages
  DROP CONSTRAINT IF EXISTS email_messages_user_id_provider_message_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS email_messages_user_provider_msg_key
  ON public.email_messages (user_id, provider, provider_message_id);

CREATE INDEX IF NOT EXISTS email_drafts_user_provider_idx
  ON public.email_drafts (user_id, provider);