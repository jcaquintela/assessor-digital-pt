ALTER TABLE public.file_categories ADD COLUMN IF NOT EXISTS color TEXT;

-- Garantir que a coluna é acessível via Data API
GRANT SELECT, INSERT, UPDATE, DELETE ON public.file_categories TO authenticated;
GRANT ALL ON public.file_categories TO service_role;