-- Fase 2 ACI V1: conversa partilhada por conta entre WhatsApp e Telegram.
-- Só acrescentos. Com o interruptor assessor.cross_channel.v1 desligado,
-- nada disto é lido e o comportamento por canal mantém-se.

ALTER TABLE public.pending_actions
  ADD COLUMN IF NOT EXISTS presented_channels text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS confirm_token text,
  ADD COLUMN IF NOT EXISTS confirm_token_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_channel text;

COMMENT ON COLUMN public.pending_actions.presented_channels IS 'Canais onde a pergunta deste pendente foi mostrada ao consultor. Vazio = só o canal de origem (coluna channel).';
COMMENT ON COLUMN public.pending_actions.confirm_token IS 'Reserva atómica de confirmação: só um turno de cada vez pode confirmar este pendente.';
COMMENT ON COLUMN public.pending_actions.resolved_channel IS 'Canal onde o consultor confirmou/recusou (pode diferir da origem).';

ALTER TABLE public.conversation_states
  ADD COLUMN IF NOT EXISTS last_channel text;

COMMENT ON COLUMN public.conversation_states.last_channel IS 'Canal da última escrita no estado partilhado da conta (linha channel=account).';

CREATE INDEX IF NOT EXISTS pending_actions_user_status_created_idx
  ON public.pending_actions (user_id, status, created_at DESC);

CREATE OR REPLACE FUNCTION public.claim_pending_confirmation(
  _user_id uuid, _ids uuid[], _token text, _ttl_seconds integer DEFAULT 120
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _n integer;
BEGIN
  UPDATE public.pending_actions
     SET confirm_token = _token,
         confirm_token_at = now()
   WHERE user_id = _user_id
     AND id = ANY(_ids)
     AND status IN ('pending_confirmation','collecting_information','correction_pending')
     AND (confirm_token IS NULL
          OR confirm_token = _token
          OR confirm_token_at < now() - make_interval(secs => _ttl_seconds));
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_pending_confirmation(
  _user_id uuid, _token text, _channel text
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _n integer;
BEGIN
  UPDATE public.pending_actions
     SET confirm_token = NULL,
         confirm_token_at = NULL,
         resolved_channel = CASE
           WHEN status IN ('executed','cancelled','corrected','failed')
             THEN coalesce(resolved_channel, _channel)
           ELSE resolved_channel
         END
   WHERE user_id = _user_id
     AND confirm_token = _token;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_pending_presented(
  _user_id uuid, _ids uuid[], _channel text
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _n integer;
BEGIN
  UPDATE public.pending_actions
     SET presented_channels = array_append(
           CASE WHEN cardinality(presented_channels) = 0 THEN ARRAY[channel] ELSE presented_channels END,
           _channel)
   WHERE user_id = _user_id
     AND id = ANY(_ids)
     AND NOT (_channel = ANY(
           CASE WHEN cardinality(presented_channels) = 0 THEN ARRAY[channel] ELSE presented_channels END));
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_pending_confirmation(uuid, uuid[], text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_pending_confirmation(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_pending_presented(uuid, uuid[], text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pending_confirmation(uuid, uuid[], text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_pending_confirmation(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_pending_presented(uuid, uuid[], text) TO service_role;