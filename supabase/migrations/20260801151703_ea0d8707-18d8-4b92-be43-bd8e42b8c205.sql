CREATE TABLE public.landing_page_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Europe/Lisbon')::date,
  visit_hour smallint NOT NULL DEFAULT EXTRACT(hour FROM (now() AT TIME ZONE 'Europe/Lisbon')),
  referrer_host text,
  path text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.landing_page_visits TO service_role;

ALTER TABLE public.landing_page_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "landing_page_visits_admin_read"
  ON public.landing_page_visits FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE INDEX landing_page_visits_date_idx ON public.landing_page_visits (visit_date);