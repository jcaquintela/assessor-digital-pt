CREATE TABLE public.app_user_connection_aliases (
  user_id uuid NOT NULL,
  connector_id text NOT NULL,
  app_user_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, connector_id)
);
GRANT ALL ON public.app_user_connection_aliases TO service_role;
ALTER TABLE public.app_user_connection_aliases ENABLE ROW LEVEL SECURITY;