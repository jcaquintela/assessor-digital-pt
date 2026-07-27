ALTER TABLE public.follow_ups
  ADD COLUMN IF NOT EXISTS source_channel text NULL,
  ADD COLUMN IF NOT EXISTS source_message_id text NULL,
  ADD COLUMN IF NOT EXISTS source_pending_action_id uuid NULL,
  ADD COLUMN IF NOT EXISTS timezone text NULL,
  ADD COLUMN IF NOT EXISTS external_reference text NULL,
  ADD COLUMN IF NOT EXISTS created_by_assessor boolean NOT NULL DEFAULT false;

-- Pesquisa por mensagem de origem (WhatsApp/Telegram)
CREATE INDEX IF NOT EXISTS follow_ups_source_message_id_idx
  ON public.follow_ups (source_message_id)
  WHERE source_message_id IS NOT NULL;

-- Métricas agregadas por canal (Super Admin)
CREATE INDEX IF NOT EXISTS follow_ups_source_channel_idx
  ON public.follow_ups (source_channel)
  WHERE source_channel IS NOT NULL;

-- Auditoria por ação pendente + idempotência (mesma pending só cria 1 seguimento)
CREATE UNIQUE INDEX IF NOT EXISTS follow_ups_source_pending_action_id_uidx
  ON public.follow_ups (source_pending_action_id)
  WHERE source_pending_action_id IS NOT NULL;