
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS assessor_name text NOT NULL DEFAULT 'Assessor';

CREATE TABLE IF NOT EXISTS public.assessor_ai_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid,
  channel text NOT NULL,
  model text NOT NULL,
  intent text,
  confidence numeric,
  input_tokens int,
  output_tokens int,
  total_tokens int,
  latency_ms int,
  success boolean NOT NULL DEFAULT true,
  error text,
  estimated_cost_usd numeric
);

GRANT SELECT ON public.assessor_ai_logs TO authenticated;
GRANT ALL ON public.assessor_ai_logs TO service_role;
ALTER TABLE public.assessor_ai_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read AI logs" ON public.assessor_ai_logs
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS assessor_ai_logs_created_at_idx ON public.assessor_ai_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS assessor_ai_logs_user_id_idx ON public.assessor_ai_logs (user_id);
