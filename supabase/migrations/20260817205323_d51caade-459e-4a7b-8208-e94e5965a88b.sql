CREATE TABLE public.alert_mutes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  alert_key text NOT NULL,
  muted_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, alert_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.alert_mutes TO authenticated;
GRANT ALL ON public.alert_mutes TO service_role;

ALTER TABLE public.alert_mutes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "alert_mutes_own" ON public.alert_mutes
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER alert_mutes_set_updated_at
  BEFORE UPDATE ON public.alert_mutes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();