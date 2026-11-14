CREATE TABLE public.inbound_message_claims (
  channel text NOT NULL,
  external_message_id text NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 1,
  PRIMARY KEY (channel, external_message_id)
);
GRANT SELECT ON public.inbound_message_claims TO authenticated;
GRANT ALL ON public.inbound_message_claims TO service_role;
ALTER TABLE public.inbound_message_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read inbound claims" ON public.inbound_message_claims
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE INDEX inbound_message_claims_claimed_at_idx ON public.inbound_message_claims (claimed_at);

CREATE OR REPLACE FUNCTION public.claim_inbound_message(_channel text, _external_id text, _stale_seconds integer DEFAULT 600)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _ok boolean;
BEGIN
  IF _channel IS NULL OR _external_id IS NULL OR length(_external_id) = 0 THEN
    RETURN true;
  END IF;
  INSERT INTO public.inbound_message_claims AS c (channel, external_message_id)
  VALUES (_channel, _external_id)
  ON CONFLICT (channel, external_message_id) DO UPDATE
    SET claimed_at = now(), attempts = c.attempts + 1
    WHERE c.claimed_at < now() - make_interval(secs => greatest(_stale_seconds, 60))
      AND NOT EXISTS (SELECT 1 FROM public.assessor_messages m WHERE m.whatsapp_message_id = _external_id)
  RETURNING true INTO _ok;
  RETURN coalesce(_ok, false);
END $$;
REVOKE ALL ON FUNCTION public.claim_inbound_message(text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_inbound_message(text, text, integer) TO service_role;