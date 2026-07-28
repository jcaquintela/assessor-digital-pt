ALTER TABLE public.assessor_ai_logs
  ADD COLUMN IF NOT EXISTS domain text,
  ADD COLUMN IF NOT EXISTS route text,
  ADD COLUMN IF NOT EXISTS fallback_used boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS assessor_ai_logs_user_created_idx
  ON public.assessor_ai_logs (user_id, created_at DESC);