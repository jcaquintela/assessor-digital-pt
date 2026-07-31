-- TAGS
CREATE TABLE public.tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  color text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX tags_user_name_uniq ON public.tags (user_id, lower(name));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tags TO authenticated;
GRANT ALL ON public.tags TO service_role;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tags_own" ON public.tags FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER tags_touch BEFORE UPDATE ON public.tags
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ENTITY TAGS
CREATE TABLE public.entity_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tag_id, entity_type, entity_id)
);
CREATE INDEX entity_tags_lookup ON public.entity_tags (user_id, entity_type, entity_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.entity_tags TO authenticated;
GRANT ALL ON public.entity_tags TO service_role;
ALTER TABLE public.entity_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "entity_tags_own" ON public.entity_tags FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- FOLDERS
CREATE TABLE public.folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX folders_user_name_uniq ON public.folders (user_id, lower(name));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.folders TO authenticated;
GRANT ALL ON public.folders TO service_role;
ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "folders_own" ON public.folders FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER folders_touch BEFORE UPDATE ON public.folders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- FOLDER ITEMS
CREATE TABLE public.folder_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  folder_id uuid NOT NULL REFERENCES public.folders(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (folder_id, entity_type, entity_id)
);
CREATE INDEX folder_items_lookup ON public.folder_items (user_id, entity_type, entity_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.folder_items TO authenticated;
GRANT ALL ON public.folder_items TO service_role;
ALTER TABLE public.folder_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "folder_items_own" ON public.folder_items FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- DRIVE custom category
ALTER TABLE public.uploaded_files ADD COLUMN IF NOT EXISTS custom_category text;