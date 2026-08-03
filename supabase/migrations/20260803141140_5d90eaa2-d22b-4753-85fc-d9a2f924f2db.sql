ALTER TABLE public.uploaded_files
  ADD COLUMN IF NOT EXISTS doc_issued_on date,
  ADD COLUMN IF NOT EXISTS doc_expires_on date,
  ADD COLUMN IF NOT EXISTS doc_nif text,
  ADD COLUMN IF NOT EXISTS doc_artigo_matricial text,
  ADD COLUMN IF NOT EXISTS doc_fracao text,
  ADD COLUMN IF NOT EXISTS doc_morada text,
  ADD COLUMN IF NOT EXISTS photo_value text;

CREATE INDEX IF NOT EXISTS uploaded_files_expiry_idx
  ON public.uploaded_files (user_id, doc_expires_on)
  WHERE doc_expires_on IS NOT NULL AND deleted_at IS NULL;