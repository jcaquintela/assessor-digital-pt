ALTER TABLE public.consultant_preferences
  ADD COLUMN IF NOT EXISTS confirm_document_send boolean NOT NULL DEFAULT false;