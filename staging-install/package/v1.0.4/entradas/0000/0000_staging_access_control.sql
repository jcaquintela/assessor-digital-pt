CREATE TYPE public.app_role AS ENUM ('admin', 'tester');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.has_staging_access(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','tester'))
$$;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_staging_access(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_staging_access(uuid) TO authenticated;

CREATE TABLE public.staging_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  synthetic boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.staging_notes TO authenticated;
GRANT ALL ON public.staging_notes TO service_role;
ALTER TABLE public.staging_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staging members read notes" ON public.staging_notes FOR SELECT TO authenticated USING (public.has_staging_access(auth.uid()));

INSERT INTO public.staging_notes (title, body) VALUES
  ('Gates G1–G4', 'Todos NO-GO. Nenhuma migração de código V2 aprovada.'),
  ('Integrações', 'Todas desligadas: Telegram, WhatsApp, Stripe, email, Google, Microsoft, Firecrawl.'),
  ('Dados', 'Apenas dados sintéticos. Nenhum dado de produção importado.');