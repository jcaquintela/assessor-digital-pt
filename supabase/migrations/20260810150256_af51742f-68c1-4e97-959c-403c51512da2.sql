CREATE TABLE public.invite_send_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  canal text NOT NULL DEFAULT 'whatsapp',
  status text NOT NULL DEFAULT 'pendente',
  reason text,
  error_code integer,
  destino text,
  attempts integer NOT NULL DEFAULT 1,
  last_attempt_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  requested_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX invite_send_attempts_open_uniq
  ON public.invite_send_attempts (user_id, canal)
  WHERE status = 'pendente';

CREATE INDEX invite_send_attempts_status_idx
  ON public.invite_send_attempts (status, last_attempt_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invite_send_attempts TO authenticated;
GRANT ALL ON public.invite_send_attempts TO service_role;

ALTER TABLE public.invite_send_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins gerem convites por reenviar"
ON public.invite_send_attempts FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'support_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'support_admin'));

CREATE TRIGGER invite_send_attempts_touch
BEFORE UPDATE ON public.invite_send_attempts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();