ALTER TABLE public.assessor_ai_logs
  ADD COLUMN IF NOT EXISTS modality text,
  ADD COLUMN IF NOT EXISTS billed_model text;

CREATE INDEX IF NOT EXISTS assessor_ai_logs_user_created_idx
  ON public.assessor_ai_logs (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.ai_model_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model text NOT NULL UNIQUE,
  credits_per_1m_input numeric NOT NULL,
  credits_per_1m_output numeric NOT NULL,
  source text,
  effective_from date NOT NULL DEFAULT current_date,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.ai_model_rates TO service_role;
ALTER TABLE public.ai_model_rates ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.admin_cost_settings (
  key text PRIMARY KEY,
  value numeric,
  source text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.admin_cost_settings TO service_role;
ALTER TABLE public.admin_cost_settings ENABLE ROW LEVEL SECURITY;

INSERT INTO public.ai_model_rates (model, credits_per_1m_input, credits_per_1m_output, source)
VALUES ('google/gemini-3.6-flash', 6, 30, 'derivado dos registos reais do AI Gateway (ago/2026)')
ON CONFLICT (model) DO NOTHING;

INSERT INTO public.admin_cost_settings (key, value, source)
VALUES ('credit_price_eur', NULL, 'por confirmar na faturação da workspace')
ON CONFLICT (key) DO NOTHING;