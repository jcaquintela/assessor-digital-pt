-- 1. Estender uploaded_files
ALTER TABLE public.uploaded_files
  ADD COLUMN IF NOT EXISTS checksum text,
  ADD COLUMN IF NOT EXISTS ai_summary text,
  ADD COLUMN IF NOT EXISTS requires_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_external_file_id text;

-- Backfill source_external_file_id a partir de external_file_id
UPDATE public.uploaded_files
   SET source_external_file_id = external_file_id
 WHERE source_external_file_id IS NULL AND external_file_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS uploaded_files_user_checksum_idx
  ON public.uploaded_files(user_id, checksum)
  WHERE checksum IS NOT NULL;

CREATE INDEX IF NOT EXISTS uploaded_files_user_status_idx
  ON public.uploaded_files(user_id, processing_status)
  WHERE deleted_at IS NULL;

-- 2. Tabela file_links
CREATE TABLE IF NOT EXISTS public.file_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  file_id uuid NOT NULL REFERENCES public.uploaded_files(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN (
    'person','property','opportunity','follow_up','interaction','miscellaneous','prospecting_lead'
  )),
  entity_id uuid NOT NULL,
  relation_type text NOT NULL DEFAULT 'belongs_to' CHECK (relation_type IN (
    'belongs_to','supports','received_from','related_to','version_of','evidence_for','attachment'
  )),
  source text NOT NULL DEFAULT 'user' CHECK (source IN ('ai','user','rule','migration')),
  confidence numeric,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, file_id, entity_type, entity_id, relation_type)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.file_links TO authenticated;
GRANT ALL ON public.file_links TO service_role;

ALTER TABLE public.file_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "file_links_owner_all"
  ON public.file_links FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS file_links_user_entity_idx
  ON public.file_links(user_id, entity_type, entity_id);

CREATE INDEX IF NOT EXISTS file_links_user_file_idx
  ON public.file_links(user_id, file_id);

-- 3. Backfill a partir de related_resource_type/id
INSERT INTO public.file_links (user_id, file_id, entity_type, entity_id, relation_type, source, confidence, confirmed_at, created_at)
SELECT
  uf.user_id,
  uf.id,
  CASE uf.related_resource_type
    WHEN 'people' THEN 'person'
    WHEN 'person' THEN 'person'
    WHEN 'properties' THEN 'property'
    WHEN 'property' THEN 'property'
    WHEN 'opportunities' THEN 'opportunity'
    WHEN 'opportunity' THEN 'opportunity'
    WHEN 'follow_ups' THEN 'follow_up'
    WHEN 'follow_up' THEN 'follow_up'
    WHEN 'interactions' THEN 'interaction'
    WHEN 'interaction' THEN 'interaction'
    WHEN 'miscellaneous_items' THEN 'miscellaneous'
    WHEN 'miscellaneous' THEN 'miscellaneous'
    WHEN 'prospecting_leads' THEN 'prospecting_lead'
    WHEN 'prospecting_lead' THEN 'prospecting_lead'
    ELSE NULL
  END,
  uf.related_resource_id,
  'belongs_to',
  'migration',
  1.0,
  uf.updated_at,
  uf.created_at
FROM public.uploaded_files uf
WHERE uf.related_resource_type IS NOT NULL
  AND uf.related_resource_id IS NOT NULL
  AND uf.user_id IS NOT NULL
  AND CASE uf.related_resource_type
    WHEN 'people' THEN 'person'
    WHEN 'person' THEN 'person'
    WHEN 'properties' THEN 'property'
    WHEN 'property' THEN 'property'
    WHEN 'opportunities' THEN 'opportunity'
    WHEN 'opportunity' THEN 'opportunity'
    WHEN 'follow_ups' THEN 'follow_up'
    WHEN 'follow_up' THEN 'follow_up'
    WHEN 'interactions' THEN 'interaction'
    WHEN 'interaction' THEN 'interaction'
    WHEN 'miscellaneous_items' THEN 'miscellaneous'
    WHEN 'miscellaneous' THEN 'miscellaneous'
    WHEN 'prospecting_leads' THEN 'prospecting_lead'
    WHEN 'prospecting_lead' THEN 'prospecting_lead'
    ELSE NULL
  END IS NOT NULL
ON CONFLICT DO NOTHING;

-- 4. Feature flag drive.v1
INSERT INTO public.feature_flags (key, description, enabled_globally, enabled_plans, rollout_percentage)
VALUES ('drive.v1', 'Drive Inteligente v1 — nova área de ficheiros com relações múltiplas e classificação automática', false, ARRAY[]::text[], 0)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.feature_flag_users (flag_key, user_id)
SELECT 'drive.v1', p.id
FROM public.profiles p
WHERE p.email = 'julio.quintela@saguii.com'
ON CONFLICT DO NOTHING;