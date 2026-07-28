
-- Reasoning Engine v3: telemetria de raciocínio + feature flag global (off).

CREATE TABLE public.assessor_reasoning_traces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel text NOT NULL,
  source_message_id text,
  input_content text NOT NULL,
  observations jsonb NOT NULL DEFAULT '[]'::jsonb,
  hypotheses jsonb NOT NULL DEFAULT '[]'::jsonb,
  searches jsonb NOT NULL DEFAULT '{}'::jsonb,
  decision jsonb NOT NULL DEFAULT '{}'::jsonb,
  tool_calls jsonb NOT NULL DEFAULT '[]'::jsonb,
  memory_writes jsonb NOT NULL DEFAULT '[]'::jsonb,
  reply text,
  think_latency_ms integer,
  decide_latency_ms integer,
  total_latency_ms integer,
  input_tokens integer,
  output_tokens integer,
  success boolean NOT NULL DEFAULT true,
  error text
);

GRANT SELECT ON public.assessor_reasoning_traces TO authenticated;
GRANT ALL ON public.assessor_reasoning_traces TO service_role;

ALTER TABLE public.assessor_reasoning_traces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reasoning_traces_owner_select"
  ON public.assessor_reasoning_traces FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX assessor_reasoning_traces_user_created_idx
  ON public.assessor_reasoning_traces (user_id, created_at DESC);

INSERT INTO public.feature_flags (key, description, enabled_globally, enabled_plans, rollout_percentage)
VALUES (
  'assessor.engine.v3',
  'Motor Reasoning Engine (Observe -> Think -> Search -> Decide -> Act). Substitui o v2 quando activo.',
  false,
  ARRAY[]::text[],
  0
)
ON CONFLICT (key) DO NOTHING;
