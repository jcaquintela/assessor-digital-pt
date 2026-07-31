CREATE TABLE public.file_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.file_categories TO authenticated;
GRANT ALL ON public.file_categories TO service_role;

ALTER TABLE public.file_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Consultor gere as suas categorias"
ON public.file_categories FOR ALL TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER file_categories_touch
BEFORE UPDATE ON public.file_categories
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.uploaded_files
  ADD COLUMN custom_category_id uuid REFERENCES public.file_categories(id) ON DELETE SET NULL;

CREATE INDEX uploaded_files_custom_category_id_idx
  ON public.uploaded_files (custom_category_id);