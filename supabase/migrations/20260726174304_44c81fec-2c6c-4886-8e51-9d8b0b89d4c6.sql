
CREATE TABLE IF NOT EXISTS public.whatsapp_send_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  to_phone TEXT NOT NULL,
  phone_number_id TEXT,
  http_status INTEGER,
  ok BOOLEAN NOT NULL DEFAULT false,
  message_id TEXT,
  error_code INTEGER,
  error_subcode INTEGER,
  error_type TEXT,
  error_message TEXT,
  fbtrace_id TEXT,
  triggered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  kind TEXT NOT NULL DEFAULT 'auto'
);
GRANT SELECT ON public.whatsapp_send_logs TO authenticated;
GRANT ALL ON public.whatsapp_send_logs TO service_role;
ALTER TABLE public.whatsapp_send_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read whatsapp send logs"
  ON public.whatsapp_send_logs FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));
CREATE INDEX IF NOT EXISTS whatsapp_send_logs_created_idx
  ON public.whatsapp_send_logs (created_at DESC);
