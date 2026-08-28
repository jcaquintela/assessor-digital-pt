CREATE TABLE public.similar_listing_searches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cache_key TEXT NOT NULL,
  query TEXT NOT NULL,
  results JSONB NOT NULL DEFAULT '[]'::jsonb,
  cache_hit BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.similar_listing_searches TO authenticated;
GRANT ALL ON public.similar_listing_searches TO service_role;

ALTER TABLE public.similar_listing_searches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Consultores veem as suas pesquisas de mercado"
ON public.similar_listing_searches FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Consultores registam as suas pesquisas de mercado"
ON public.similar_listing_searches FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_similar_listing_cache ON public.similar_listing_searches (user_id, cache_key, created_at DESC);
CREATE INDEX idx_similar_listing_daily ON public.similar_listing_searches (user_id, created_at DESC);