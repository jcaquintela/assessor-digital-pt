ALTER TABLE public.uploaded_files
  ADD COLUMN IF NOT EXISTS system_category text,
  ADD COLUMN IF NOT EXISTS duplicate_of uuid REFERENCES public.uploaded_files(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS uploaded_files_user_checksum_idx
  ON public.uploaded_files (user_id, checksum)
  WHERE checksum IS NOT NULL;

CREATE INDEX IF NOT EXISTS uploaded_files_user_system_category_idx
  ON public.uploaded_files (user_id, system_category)
  WHERE system_category IS NOT NULL;

CREATE INDEX IF NOT EXISTS uploaded_files_duplicate_of_idx
  ON public.uploaded_files (duplicate_of)
  WHERE duplicate_of IS NOT NULL;