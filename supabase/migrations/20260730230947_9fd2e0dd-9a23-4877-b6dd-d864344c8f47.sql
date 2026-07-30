
CREATE TABLE public.app_user_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  connector_id text NOT NULL,
  connection_key_ciphertext text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, connector_id)
);
GRANT ALL ON public.app_user_connections TO service_role;
ALTER TABLE public.app_user_connections ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.calendar_event_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('google_calendar','microsoft_outlook')),
  follow_up_id uuid NOT NULL REFERENCES public.follow_ups(id) ON DELETE CASCADE,
  external_event_id text NOT NULL,
  external_calendar_id text,
  external_updated_at timestamptz,
  local_updated_at timestamptz,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  last_origin text,
  deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider, follow_up_id),
  UNIQUE (user_id, provider, external_event_id)
);
GRANT SELECT ON public.calendar_event_links TO authenticated;
GRANT ALL ON public.calendar_event_links TO service_role;
ALTER TABLE public.calendar_event_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own links readable" ON public.calendar_event_links
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX idx_cal_links_user_provider ON public.calendar_event_links (user_id, provider);

CREATE TABLE public.calendar_sync_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('google_calendar','microsoft_outlook')),
  calendar_id text,
  sync_token text,
  delta_link text,
  last_polled_at timestamptz,
  last_error text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);
GRANT SELECT ON public.calendar_sync_state TO authenticated;
GRANT ALL ON public.calendar_sync_state TO service_role;
ALTER TABLE public.calendar_sync_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sync state readable" ON public.calendar_sync_state
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.calendar_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider text NOT NULL,
  follow_up_id uuid,
  external_event_id text,
  direction text NOT NULL,
  action text NOT NULL,
  origin text NOT NULL,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.calendar_sync_log TO authenticated;
GRANT ALL ON public.calendar_sync_log TO service_role;
ALTER TABLE public.calendar_sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sync log readable" ON public.calendar_sync_log
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX idx_cal_log_user_created ON public.calendar_sync_log (user_id, created_at DESC);

CREATE TRIGGER cal_links_set_updated_at BEFORE UPDATE ON public.calendar_event_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER cal_sync_state_set_updated_at BEFORE UPDATE ON public.calendar_sync_state
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER app_user_connections_set_updated_at BEFORE UPDATE ON public.app_user_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
