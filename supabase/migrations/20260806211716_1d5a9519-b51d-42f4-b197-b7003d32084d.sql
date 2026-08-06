CREATE TABLE public.daily_digests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  digest_date date NOT NULL UNIQUE,
  subject text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'rascunho',
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  sent_at timestamptz,
  recipients_count integer NOT NULL DEFAULT 0,
  broadcast_id uuid REFERENCES public.admin_broadcasts(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX daily_digests_date_idx ON public.daily_digests (digest_date DESC);

GRANT SELECT ON public.daily_digests TO authenticated;
GRANT ALL ON public.daily_digests TO service_role;

ALTER TABLE public.daily_digests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "daily_digests_admin_read" ON public.daily_digests
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.daily_digests_validate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status NOT IN ('rascunho','aprovado','enviado','sem_novidades','falhou') THEN
    RAISE EXCEPTION 'estado de resumo diario invalido: %', NEW.status;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER daily_digests_biu
BEFORE INSERT OR UPDATE ON public.daily_digests
FOR EACH ROW EXECUTE FUNCTION public.daily_digests_validate();