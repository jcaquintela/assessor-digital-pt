-- 1) assessor_nudges
CREATE TABLE public.assessor_nudges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  subject_type text,
  subject_id uuid,
  reason text NOT NULL,
  suggested_reply text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  dedupe_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.assessor_nudges TO authenticated;
GRANT ALL ON public.assessor_nudges TO service_role;

ALTER TABLE public.assessor_nudges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own nudges read" ON public.assessor_nudges
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX assessor_nudges_user_status_idx
  ON public.assessor_nudges(user_id, status, scheduled_for);

CREATE UNIQUE INDEX assessor_nudges_dedupe_uidx
  ON public.assessor_nudges(user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE TRIGGER assessor_nudges_set_updated_at
  BEFORE UPDATE ON public.assessor_nudges
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) assessor_quality_scores
CREATE TABLE public.assessor_quality_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel text NOT NULL,
  trace_id uuid REFERENCES public.assessor_reasoning_traces(id) ON DELETE SET NULL,
  understood_first_try boolean,
  reformulated boolean,
  executed_successfully boolean,
  human_tone boolean,
  score numeric(4,3),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.assessor_quality_scores TO authenticated;
GRANT ALL ON public.assessor_quality_scores TO service_role;

ALTER TABLE public.assessor_quality_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own aqs read" ON public.assessor_quality_scores
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX assessor_quality_scores_user_created_idx
  ON public.assessor_quality_scores(user_id, created_at DESC);
CREATE INDEX assessor_quality_scores_created_idx
  ON public.assessor_quality_scores(created_at DESC);