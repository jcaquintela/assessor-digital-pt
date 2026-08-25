CREATE TABLE public.event_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_categories TO authenticated;
GRANT ALL ON public.event_categories TO service_role;

ALTER TABLE public.event_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own event categories"
ON public.event_categories FOR ALL TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER event_categories_touch
BEFORE UPDATE ON public.event_categories
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.follow_ups
  ADD COLUMN event_category text,
  ADD COLUMN event_category_id uuid REFERENCES public.event_categories(id) ON DELETE SET NULL;

CREATE INDEX idx_follow_ups_event_category ON public.follow_ups (user_id, event_category);
CREATE INDEX idx_follow_ups_event_category_id ON public.follow_ups (event_category_id);