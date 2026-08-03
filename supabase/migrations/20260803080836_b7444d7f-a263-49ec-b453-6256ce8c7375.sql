CREATE TABLE public.product_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'suggestion',
  body text NOT NULL,
  channel text NOT NULL DEFAULT 'dashboard',
  status text NOT NULL DEFAULT 'novo',
  internal_note text,
  handled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  handled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX product_feedback_user_idx ON public.product_feedback (user_id, created_at DESC);
CREATE INDEX product_feedback_status_idx ON public.product_feedback (status, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_feedback TO authenticated;
GRANT ALL ON public.product_feedback TO service_role;

ALTER TABLE public.product_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_feedback_owner_read" ON public.product_feedback
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "product_feedback_owner_insert" ON public.product_feedback
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "product_feedback_admin_update" ON public.product_feedback
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "product_feedback_admin_delete" ON public.product_feedback
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.product_feedback_validate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.kind NOT IN ('bug','suggestion') THEN
    RAISE EXCEPTION 'tipo de feedback invalido: %', NEW.kind;
  END IF;
  IF NEW.status NOT IN ('novo','em_analise','resolvido','arquivado') THEN
    RAISE EXCEPTION 'estado de feedback invalido: %', NEW.status;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER product_feedback_biu
BEFORE INSERT OR UPDATE ON public.product_feedback
FOR EACH ROW EXECUTE FUNCTION public.product_feedback_validate();