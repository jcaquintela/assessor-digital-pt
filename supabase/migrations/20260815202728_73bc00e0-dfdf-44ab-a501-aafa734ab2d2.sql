CREATE TABLE public.mentor_decisions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  tip_key text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('confirmar','editar','cancelar')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mentor_decisions_user_key_idx ON public.mentor_decisions (user_id, tip_key, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mentor_decisions TO authenticated;
GRANT ALL ON public.mentor_decisions TO service_role;
ALTER TABLE public.mentor_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mentor_decisions_own" ON public.mentor_decisions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);