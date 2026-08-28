ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS work_area text,
  ADD COLUMN IF NOT EXISTS team_context text,
  ADD COLUMN IF NOT EXISTS profile_questions_asked jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS profile_last_question_at timestamptz,
  ADD COLUMN IF NOT EXISTS profile_refusal_streak integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS profile_paused_until timestamptz,
  ADD COLUMN IF NOT EXISTS profile_notice_sent_at timestamptz;