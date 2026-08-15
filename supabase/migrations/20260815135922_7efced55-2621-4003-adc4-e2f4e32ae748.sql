-- Ligações de email por consultor (metadados; a chave fica em app_user_connections)
CREATE TABLE public.email_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'gmail',
  email_address text,
  connected_at timestamptz NOT NULL DEFAULT now(),
  last_ok_at timestamptz,
  -- Em modo Teste do Google o refresh token expira ~7 dias.
  expires_at timestamptz,
  reauth_warned_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_connections TO authenticated;
GRANT ALL ON public.email_connections TO service_role;
ALTER TABLE public.email_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "email_connections_own" ON public.email_connections
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.email_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'gmail',
  provider_thread_id text NOT NULL,
  subject text,
  last_message_at timestamptz,
  person_id uuid REFERENCES public.people(id) ON DELETE SET NULL,
  summary text,
  summarized_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider, provider_thread_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_threads TO authenticated;
GRANT ALL ON public.email_threads TO service_role;
ALTER TABLE public.email_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "email_threads_own" ON public.email_threads
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX email_threads_user_last_msg_idx ON public.email_threads (user_id, last_message_at DESC);
CREATE INDEX email_threads_person_idx ON public.email_threads (person_id);

-- Sem body_text por decisão de produto: só snippet + resumo. O corpo é lido
-- no Gmail on-demand para reduzir superfície de dados sensíveis (CASA).
CREATE TABLE public.email_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id uuid NOT NULL REFERENCES public.email_threads(id) ON DELETE CASCADE,
  provider_message_id text NOT NULL,
  from_email text,
  from_name text,
  to_emails text[] NOT NULL DEFAULT '{}',
  sent_at timestamptz,
  snippet text,
  direction text NOT NULL DEFAULT 'inbound',
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider_message_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_messages TO authenticated;
GRANT ALL ON public.email_messages TO service_role;
ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "email_messages_own" ON public.email_messages
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX email_messages_thread_idx ON public.email_messages (thread_id, sent_at DESC);
CREATE INDEX email_messages_from_idx ON public.email_messages (user_id, from_email);

CREATE TABLE public.email_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id uuid REFERENCES public.email_threads(id) ON DELETE CASCADE,
  provider_draft_id text,
  to_emails text[] NOT NULL DEFAULT '{}',
  subject text,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_drafts TO authenticated;
GRANT ALL ON public.email_drafts TO service_role;
ALTER TABLE public.email_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "email_drafts_own" ON public.email_drafts
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX email_drafts_user_status_idx ON public.email_drafts (user_id, status);

CREATE OR REPLACE FUNCTION public.email_drafts_validate()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status NOT IN ('pending','confirmed','discarded','sent') THEN
    RAISE EXCEPTION 'estado de rascunho inválido: %', NEW.status;
  END IF;
  IF NEW.status IN ('confirmed','sent') AND NEW.confirmed_at IS NULL THEN
    NEW.confirmed_at := now();
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER email_drafts_validate_trg BEFORE INSERT OR UPDATE ON public.email_drafts
  FOR EACH ROW EXECUTE FUNCTION public.email_drafts_validate();

CREATE TRIGGER email_connections_touch BEFORE UPDATE ON public.email_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER email_threads_touch BEFORE UPDATE ON public.email_threads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER email_messages_touch BEFORE UPDATE ON public.email_messages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER email_drafts_touch BEFORE UPDATE ON public.email_drafts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();