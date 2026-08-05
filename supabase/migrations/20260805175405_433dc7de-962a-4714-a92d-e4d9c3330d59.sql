CREATE TABLE public.product_telemetry_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event text NOT NULL,
  lead_id uuid,
  channel text,
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX product_telemetry_events_user_event_idx
  ON public.product_telemetry_events (user_id, event, occurred_at DESC);
CREATE INDEX product_telemetry_events_lead_idx
  ON public.product_telemetry_events (lead_id);

GRANT SELECT, INSERT ON public.product_telemetry_events TO authenticated;
GRANT ALL ON public.product_telemetry_events TO service_role;

ALTER TABLE public.product_telemetry_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "telemetry_own_select" ON public.product_telemetry_events
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "telemetry_own_insert" ON public.product_telemetry_events
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());