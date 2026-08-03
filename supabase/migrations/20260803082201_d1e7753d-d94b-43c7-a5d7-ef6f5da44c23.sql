ALTER TABLE public.product_feedback
  ADD COLUMN IF NOT EXISTS attachment_file_id uuid REFERENCES public.uploaded_files(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS product_feedback_attachment_idx
  ON public.product_feedback (attachment_file_id)
  WHERE attachment_file_id IS NOT NULL;