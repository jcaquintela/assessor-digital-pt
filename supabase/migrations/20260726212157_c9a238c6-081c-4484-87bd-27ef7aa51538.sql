
CREATE TABLE public.routines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  notes TEXT,
  frequency TEXT NOT NULL DEFAULT 'weekly',
  interval_n INT NOT NULL DEFAULT 1,
  weekday INT,
  day_of_month INT,
  time_of_day TEXT,
  next_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_run_at TIMESTAMPTZ,
  priority TEXT NOT NULL DEFAULT 'Média',
  person_id UUID,
  opportunity_id UUID,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT routines_frequency_chk CHECK (frequency IN ('daily','weekly','monthly')),
  CONSTRAINT routines_interval_chk CHECK (interval_n >= 1 AND interval_n <= 365),
  CONSTRAINT routines_weekday_chk CHECK (weekday IS NULL OR (weekday BETWEEN 0 AND 6)),
  CONSTRAINT routines_dom_chk CHECK (day_of_month IS NULL OR (day_of_month BETWEEN 1 AND 31))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.routines TO authenticated;
GRANT ALL ON public.routines TO service_role;

ALTER TABLE public.routines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "routines_owner_all" ON public.routines
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX routines_user_next_idx ON public.routines (user_id, active, next_run_at);

CREATE TRIGGER routines_set_updated_at
  BEFORE UPDATE ON public.routines
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
