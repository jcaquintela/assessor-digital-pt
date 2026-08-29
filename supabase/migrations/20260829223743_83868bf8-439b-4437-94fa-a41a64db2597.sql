CREATE TABLE public.deal_deadlines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  opportunity_id uuid NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  label text NOT NULL,
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto','cumprido','cancelado')),
  notes text,
  notice_days integer,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.deal_deadlines TO authenticated;
GRANT ALL ON public.deal_deadlines TO service_role;

ALTER TABLE public.deal_deadlines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own deal deadlines"
ON public.deal_deadlines FOR ALL TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX deal_deadlines_user_due_idx ON public.deal_deadlines (user_id, due_date);
CREATE INDEX deal_deadlines_opportunity_idx ON public.deal_deadlines (opportunity_id);

CREATE TRIGGER deal_deadlines_set_updated_at
BEFORE UPDATE ON public.deal_deadlines
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.deal_deadlines (user_id, opportunity_id, label, due_date, status, created_at)
SELECT o.user_id, o.id, 'Prazo', (o.deadline AT TIME ZONE 'Europe/Lisbon')::date, 'aberto', now()
FROM public.opportunities o
WHERE o.deadline IS NOT NULL AND o.user_id IS NOT NULL;