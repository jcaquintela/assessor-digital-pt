
-- =========================================================
-- Trust Mode v1 — Foundational tables
-- =========================================================

-- Categorias de correções
DO $$ BEGIN
  CREATE TYPE public.assistant_correction_category AS ENUM (
    'wrong_person','wrong_property','wrong_date','wrong_document',
    'lost_context','unnatural_reply','unnecessary_question',
    'wrong_execution','other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.assistant_reflection_trigger AS ENUM (
    'low_aqs','low_ats','user_correction'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------
-- assistant_user_corrections
-- ---------------------------------------------------------
CREATE TABLE public.assistant_user_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  channel text NOT NULL,
  conversation_id text,
  turn_id uuid REFERENCES public.assessor_reasoning_traces(id) ON DELETE SET NULL,
  category public.assistant_correction_category NOT NULL DEFAULT 'other',
  original_message text,
  correction_message text NOT NULL,
  final_result text,
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.assistant_user_corrections TO authenticated;
GRANT ALL ON public.assistant_user_corrections TO service_role;
ALTER TABLE public.assistant_user_corrections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "corrections_admin_read"
  ON public.assistant_user_corrections FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));
CREATE TRIGGER trg_corrections_updated
  BEFORE UPDATE ON public.assistant_user_corrections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_corrections_user_created ON public.assistant_user_corrections(user_id, created_at DESC);
CREATE INDEX idx_corrections_category ON public.assistant_user_corrections(category);

-- ---------------------------------------------------------
-- assistant_trust_scores
-- ---------------------------------------------------------
CREATE TABLE public.assistant_trust_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  channel text NOT NULL,
  trace_id uuid REFERENCES public.assessor_reasoning_traces(id) ON DELETE CASCADE,
  task_success numeric,               -- 0|1|null
  aqs_score numeric,                  -- 0..1
  corrections_count integer NOT NULL DEFAULT 0,
  context_preservation numeric,       -- 0..1
  safe_decisions numeric,             -- 0..1
  ats numeric,                        -- 0..100
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.assistant_trust_scores TO authenticated;
GRANT ALL ON public.assistant_trust_scores TO service_role;
ALTER TABLE public.assistant_trust_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trust_admin_read"
  ON public.assistant_trust_scores FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));
CREATE INDEX idx_trust_created ON public.assistant_trust_scores(created_at DESC);
CREATE INDEX idx_trust_user ON public.assistant_trust_scores(user_id, created_at DESC);

-- ---------------------------------------------------------
-- assistant_reflections
-- ---------------------------------------------------------
CREATE TABLE public.assistant_reflections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  trace_id uuid REFERENCES public.assessor_reasoning_traces(id) ON DELETE CASCADE,
  correction_id uuid REFERENCES public.assistant_user_corrections(id) ON DELETE SET NULL,
  trigger public.assistant_reflection_trigger NOT NULL,
  analysis jsonb NOT NULL DEFAULT '{}'::jsonb,
  model text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.assistant_reflections TO authenticated;
GRANT ALL ON public.assistant_reflections TO service_role;
ALTER TABLE public.assistant_reflections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reflections_admin_read"
  ON public.assistant_reflections FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));
CREATE INDEX idx_reflections_created ON public.assistant_reflections(created_at DESC);

-- ---------------------------------------------------------
-- assistant_golden_conversations
-- ---------------------------------------------------------
CREATE TABLE public.assistant_golden_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  description text,
  turns jsonb NOT NULL DEFAULT '[]'::jsonb,
  tags text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.assistant_golden_conversations TO authenticated;
GRANT ALL ON public.assistant_golden_conversations TO service_role;
ALTER TABLE public.assistant_golden_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "golden_admin_read"
  ON public.assistant_golden_conversations FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));
CREATE TRIGGER trg_golden_updated
  BEFORE UPDATE ON public.assistant_golden_conversations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------
-- assistant_golden_runs
-- ---------------------------------------------------------
CREATE TABLE public.assistant_golden_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  golden_id uuid NOT NULL REFERENCES public.assistant_golden_conversations(id) ON DELETE CASCADE,
  release_ref text NOT NULL,
  passed boolean NOT NULL,
  ats numeric,
  aqs numeric,
  task_success numeric,
  diffs jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.assistant_golden_runs TO authenticated;
GRANT ALL ON public.assistant_golden_runs TO service_role;
ALTER TABLE public.assistant_golden_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "golden_runs_admin_read"
  ON public.assistant_golden_runs FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));
CREATE INDEX idx_golden_runs_golden ON public.assistant_golden_runs(golden_id, created_at DESC);
CREATE INDEX idx_golden_runs_release ON public.assistant_golden_runs(release_ref);

-- ---------------------------------------------------------
-- assistant_shadow_runs
-- ---------------------------------------------------------
CREATE TABLE public.assistant_shadow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  channel text NOT NULL,
  trace_id uuid REFERENCES public.assessor_reasoning_traces(id) ON DELETE CASCADE,
  strategy text NOT NULL,
  reply text,
  ats numeric,
  aqs numeric,
  task_success numeric,
  latency_ms integer,
  diff jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.assistant_shadow_runs TO authenticated;
GRANT ALL ON public.assistant_shadow_runs TO service_role;
ALTER TABLE public.assistant_shadow_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shadow_admin_read"
  ON public.assistant_shadow_runs FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));
CREATE INDEX idx_shadow_created ON public.assistant_shadow_runs(created_at DESC);
CREATE INDEX idx_shadow_strategy ON public.assistant_shadow_runs(strategy);
