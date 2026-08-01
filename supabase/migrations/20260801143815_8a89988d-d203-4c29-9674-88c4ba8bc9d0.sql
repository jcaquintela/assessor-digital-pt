CREATE TABLE public.admin_broadcast_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id uuid NOT NULL REFERENCES public.admin_broadcasts(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text,
  status text NOT NULL DEFAULT 'pendente',
  error text,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_abr_broadcast ON public.admin_broadcast_recipients(broadcast_id);

GRANT SELECT ON public.admin_broadcast_recipients TO authenticated;
GRANT ALL ON public.admin_broadcast_recipients TO service_role;

ALTER TABLE public.admin_broadcast_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_read_broadcast_recipients"
ON public.admin_broadcast_recipients
FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()));