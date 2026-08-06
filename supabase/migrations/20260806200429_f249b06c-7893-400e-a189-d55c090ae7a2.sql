ALTER TABLE public.whatsapp_send_logs
  ADD COLUMN IF NOT EXISTS purpose text,
  ADD COLUMN IF NOT EXISTS template_name text,
  ADD COLUMN IF NOT EXISTS template_category text,
  ADD COLUMN IF NOT EXISTS template_language text,
  ADD COLUMN IF NOT EXISTS outside_window boolean,
  ADD COLUMN IF NOT EXISTS hours_since_last_inbound numeric,
  ADD COLUMN IF NOT EXISTS billable boolean,
  ADD COLUMN IF NOT EXISTS cost_eur numeric,
  ADD COLUMN IF NOT EXISTS cost_source text,
  ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'sent',
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS read_at timestamptz,
  ADD COLUMN IF NOT EXISTS replied_at timestamptz,
  ADD COLUMN IF NOT EXISTS test_id uuid;

CREATE INDEX IF NOT EXISTS whatsapp_send_logs_message_id_idx
  ON public.whatsapp_send_logs (message_id) WHERE message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS whatsapp_send_logs_template_idx
  ON public.whatsapp_send_logs (created_at DESC) WHERE template_name IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.whatsapp_template_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  country_code text NOT NULL DEFAULT 'PT',
  price_eur numeric NOT NULL,
  currency text NOT NULL DEFAULT 'EUR',
  effective_from date NOT NULL DEFAULT current_date,
  source text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

GRANT SELECT ON public.whatsapp_template_rates TO authenticated;
GRANT ALL ON public.whatsapp_template_rates TO service_role;
ALTER TABLE public.whatsapp_template_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read whatsapp template rates"
  ON public.whatsapp_template_rates FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_template_rates_unique_idx
  ON public.whatsapp_template_rates (category, country_code, effective_from);

CREATE TRIGGER whatsapp_template_rates_touch
  BEFORE UPDATE ON public.whatsapp_template_rates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.whatsapp_proactive_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  purpose text NOT NULL DEFAULT 'meeting_briefing',
  to_phone text NOT NULL,
  template_name text,
  template_category text,
  hours_since_last_inbound numeric,
  outside_window boolean NOT NULL DEFAULT false,
  forced boolean NOT NULL DEFAULT true,
  send_log_id uuid REFERENCES public.whatsapp_send_logs(id) ON DELETE SET NULL,
  message_id text,
  status text NOT NULL DEFAULT 'pending',
  cost_eur numeric,
  notes text
);

GRANT SELECT ON public.whatsapp_proactive_tests TO authenticated;
GRANT ALL ON public.whatsapp_proactive_tests TO service_role;
ALTER TABLE public.whatsapp_proactive_tests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read whatsapp proactive tests"
  ON public.whatsapp_proactive_tests FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE TRIGGER whatsapp_proactive_tests_touch
  BEFORE UPDATE ON public.whatsapp_proactive_tests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();