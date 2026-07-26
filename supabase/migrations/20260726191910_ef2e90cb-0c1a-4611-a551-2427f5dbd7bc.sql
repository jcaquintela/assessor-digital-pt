-- Tabela principal
CREATE TABLE public.uploaded_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'whatsapp',
  source_message_id uuid REFERENCES public.assessor_messages(id) ON DELETE SET NULL,
  external_file_id text,
  original_file_name text,
  internal_file_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL DEFAULT 0,
  storage_path text NOT NULL,
  processing_status text NOT NULL DEFAULT 'received',
  classification text,
  extracted_text text,
  extracted_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  related_resource_type text,
  related_resource_id uuid,
  related_pending_action_id uuid REFERENCES public.pending_actions(id) ON DELETE SET NULL,
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX uploaded_files_user_created_idx ON public.uploaded_files(user_id, created_at DESC);
CREATE INDEX uploaded_files_status_idx ON public.uploaded_files(processing_status);
CREATE INDEX uploaded_files_related_idx ON public.uploaded_files(related_resource_type, related_resource_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.uploaded_files TO authenticated;
GRANT ALL ON public.uploaded_files TO service_role;

ALTER TABLE public.uploaded_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "uploaded_files_owner_select" ON public.uploaded_files
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "uploaded_files_owner_insert" ON public.uploaded_files
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "uploaded_files_owner_update" ON public.uploaded_files
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "uploaded_files_owner_delete" ON public.uploaded_files
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER uploaded_files_set_updated_at
  BEFORE UPDATE ON public.uploaded_files
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Policies no bucket privado 'assessor-files': utilizador só acede à sua pasta {user_id}/...
CREATE POLICY "assessor_files_owner_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'assessor-files'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "assessor_files_owner_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'assessor-files'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "assessor_files_owner_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'assessor-files'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "assessor_files_owner_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'assessor-files'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );