CREATE TABLE public.pilot_invite_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pilot_key text NOT NULL REFERENCES public.pilots(key),
  recipient_user_id uuid NOT NULL,
  channel text NOT NULL,
  status text NOT NULL DEFAULT 'issuing',
  invite_id uuid,
  requested_by uuid NOT NULL,
  provider_message_id text,
  error_code text,
  error_reason text,
  attempts integer NOT NULL DEFAULT 1,
  last_attempt_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pilot_invite_deliveries_channel_chk CHECK (channel IN ('whatsapp','telegram')),
  CONSTRAINT pilot_invite_deliveries_status_chk CHECK (status IN ('issuing','accepted','sent','delivered','read','failed','blocked')),
  CONSTRAINT pilot_invite_deliveries_recipient_uniq UNIQUE (pilot_key, recipient_user_id)
);
GRANT SELECT ON public.pilot_invite_deliveries TO authenticated;
GRANT ALL ON public.pilot_invite_deliveries TO service_role;
ALTER TABLE public.pilot_invite_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read pilot invite deliveries" ON public.pilot_invite_deliveries
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE INDEX pilot_invite_deliveries_provider_msg_idx ON public.pilot_invite_deliveries (provider_message_id) WHERE provider_message_id IS NOT NULL;
CREATE TRIGGER pilot_invite_deliveries_set_updated_at BEFORE UPDATE ON public.pilot_invite_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();