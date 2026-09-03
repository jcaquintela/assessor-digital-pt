CREATE TABLE public.short_links (
  code text PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  target_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

CREATE UNIQUE INDEX short_links_user_target_idx ON public.short_links (user_id, target_path);

GRANT SELECT ON public.short_links TO authenticated;
GRANT ALL ON public.short_links TO service_role;

ALTER TABLE public.short_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "short_links_owner_select" ON public.short_links
  FOR SELECT TO authenticated USING (auth.uid() = user_id);