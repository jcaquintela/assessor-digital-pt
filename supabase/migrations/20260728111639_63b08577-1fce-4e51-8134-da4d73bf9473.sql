-- 1) conversation_states: enriquecimento aditivo
ALTER TABLE public.conversation_states
  ADD COLUMN IF NOT EXISTS goal text,
  ADD COLUMN IF NOT EXISTS factual_summary text,
  ADD COLUMN IF NOT EXISTS active_person_id uuid REFERENCES public.people(id) ON DELETE SET NULL;

-- 2) pending_actions: campos confirmados incrementalmente + objectivo
ALTER TABLE public.pending_actions
  ADD COLUMN IF NOT EXISTS confirmed_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS goal text;

-- 3) assessor_ai_logs: telemetria de tool-calling
ALTER TABLE public.assessor_ai_logs
  ADD COLUMN IF NOT EXISTS tool_name text,
  ADD COLUMN IF NOT EXISTS tool_success boolean;

-- 4) auditoria de cada chamada de ferramenta pela IA (v2)
CREATE TABLE IF NOT EXISTS public.assessor_tool_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  channel text NOT NULL,
  turn_id uuid,
  tool_name text NOT NULL,
  arguments jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  success boolean NOT NULL,
  error text,
  latency_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.assessor_tool_calls TO authenticated;
GRANT ALL ON public.assessor_tool_calls TO service_role;
ALTER TABLE public.assessor_tool_calls ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own tool calls" ON public.assessor_tool_calls;
CREATE POLICY "own tool calls" ON public.assessor_tool_calls
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS assessor_tool_calls_user_created_idx
  ON public.assessor_tool_calls (user_id, created_at DESC);

-- 5) ligações de calendário (fica vazia; será usada na Fase 3)
CREATE TABLE IF NOT EXISTS public.calendar_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  external_account_id text,
  display_name text,
  scopes text[] NOT NULL DEFAULT ARRAY[]::text[],
  refresh_token_encrypted text,
  is_primary boolean NOT NULL DEFAULT false,
  connected_at timestamptz NOT NULL DEFAULT now(),
  last_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider, external_account_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_connections TO authenticated;
GRANT ALL ON public.calendar_connections TO service_role;
ALTER TABLE public.calendar_connections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own calendar connections" ON public.calendar_connections;
CREATE POLICY "own calendar connections" ON public.calendar_connections
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP TRIGGER IF EXISTS calendar_connections_touch ON public.calendar_connections;
CREATE TRIGGER calendar_connections_touch
  BEFORE UPDATE ON public.calendar_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6) feature flag para ligar o Assessor v2 por consultor
INSERT INTO public.feature_flags (key, description, enabled_globally, enabled_plans, rollout_percentage, updated_at)
VALUES (
  'assessor.engine.v2',
  'Novo motor conversacional do Assessor (Fase 1: IA central com tool-calling via Lovable AI Gateway).',
  false,
  ARRAY[]::text[],
  0,
  now()
) ON CONFLICT (key) DO NOTHING;