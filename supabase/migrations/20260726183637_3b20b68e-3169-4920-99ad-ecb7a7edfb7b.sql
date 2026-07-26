
CREATE TABLE public.miscellaneous_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  original_content TEXT,
  summary TEXT,
  category TEXT,
  source_channel TEXT NOT NULL DEFAULT 'web',
  source_message_id UUID,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'inbox',
  tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  related_person_id UUID REFERENCES public.people(id) ON DELETE SET NULL,
  related_property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  related_opportunity_id UUID REFERENCES public.opportunities(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT miscellaneous_items_status_check CHECK (status IN ('inbox','reviewed','classified','archived','deleted'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.miscellaneous_items TO authenticated;
GRANT ALL ON public.miscellaneous_items TO service_role;

ALTER TABLE public.miscellaneous_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own miscellaneous"
  ON public.miscellaneous_items
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX miscellaneous_items_user_created_idx
  ON public.miscellaneous_items(user_id, created_at DESC);

CREATE TRIGGER miscellaneous_items_set_updated_at
  BEFORE UPDATE ON public.miscellaneous_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
