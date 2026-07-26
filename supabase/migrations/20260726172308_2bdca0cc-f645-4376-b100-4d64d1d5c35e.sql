ALTER TABLE public.assessor_messages
  ALTER COLUMN user_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'app',
  ADD COLUMN IF NOT EXISTS sender_phone text,
  ADD COLUMN IF NOT EXISTS whatsapp_message_id text;

CREATE UNIQUE INDEX IF NOT EXISTS assessor_messages_wa_msg_id_uniq
  ON public.assessor_messages (whatsapp_message_id)
  WHERE whatsapp_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS assessor_messages_channel_created_idx
  ON public.assessor_messages (channel, created_at DESC);