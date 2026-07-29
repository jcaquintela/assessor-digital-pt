
-- Feature flag Supreme v1 (só Júlio)
INSERT INTO public.feature_flags (key, description, enabled_globally, enabled_plans, rollout_percentage)
VALUES ('assessor.supreme.v1', 'Assessor Supremo: Daily Operating Loop, prioridades, outcomes, autonomia', false, ARRAY[]::text[], 0)
ON CONFLICT (key) DO NOTHING;

-- consultant_preferences: uma linha por consultor
CREATE TABLE IF NOT EXISTS public.consultant_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  morning_briefing_enabled boolean NOT NULL DEFAULT true,
  morning_time time NOT NULL DEFAULT '08:00',
  morning_days int[] NOT NULL DEFAULT ARRAY[1,2,3,4,5],
  evening_wrap_enabled boolean NOT NULL DEFAULT false,
  evening_time time NOT NULL DEFAULT '19:00',
  quiet_hours_start time NOT NULL DEFAULT '22:00',
  quiet_hours_end time NOT NULL DEFAULT '07:30',
  timezone text NOT NULL DEFAULT 'Europe/Lisbon',
  primary_channel text NOT NULL DEFAULT 'whatsapp',
  max_daily_nudges int NOT NULL DEFAULT 6,
  autonomy_level text NOT NULL DEFAULT 'balanced',
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.consultant_preferences TO authenticated;
GRANT ALL ON public.consultant_preferences TO service_role;
ALTER TABLE public.consultant_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own consultant_preferences" ON public.consultant_preferences
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER consultant_preferences_set_updated_at BEFORE UPDATE ON public.consultant_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- autonomy_rules: uma linha por (user, action_type)
CREATE TABLE IF NOT EXISTS public.autonomy_rules (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  requires_confirmation boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, action_type)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.autonomy_rules TO authenticated;
GRANT ALL ON public.autonomy_rules TO service_role;
ALTER TABLE public.autonomy_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own autonomy_rules" ON public.autonomy_rules
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER autonomy_rules_set_updated_at BEFORE UPDATE ON public.autonomy_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- daily_priorities: prioridades materializadas
CREATE TABLE IF NOT EXISTS public.daily_priorities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_type text NOT NULL,
  subject_id uuid,
  action text NOT NULL,
  reasons text[] NOT NULL DEFAULT ARRAY[]::text[],
  priority_score numeric NOT NULL DEFAULT 0,
  due_at timestamptz,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  dismissed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS daily_priorities_user_score_idx
  ON public.daily_priorities (user_id, priority_score DESC)
  WHERE dismissed_at IS NULL AND completed_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS daily_priorities_user_subject_uidx
  ON public.daily_priorities (user_id, subject_type, subject_id)
  WHERE subject_id IS NOT NULL AND dismissed_at IS NULL AND completed_at IS NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_priorities TO authenticated;
GRANT ALL ON public.daily_priorities TO service_role;
ALTER TABLE public.daily_priorities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own daily_priorities read" ON public.daily_priorities
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own daily_priorities update" ON public.daily_priorities
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER daily_priorities_set_updated_at BEFORE UPDATE ON public.daily_priorities
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Outcome tracking em follow_ups
ALTER TABLE public.follow_ups
  ADD COLUMN IF NOT EXISTS outcome text,
  ADD COLUMN IF NOT EXISTS outcome_notes text,
  ADD COLUMN IF NOT EXISTS outcome_recorded_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_action_created_id uuid;

-- Extensões em assessor_nudges
ALTER TABLE public.assessor_nudges
  ADD COLUMN IF NOT EXISTS outcome text,
  ADD COLUMN IF NOT EXISTS outcome_at timestamptz,
  ADD COLUMN IF NOT EXISTS urgency text NOT NULL DEFAULT 'useful';
