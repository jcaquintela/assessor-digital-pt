ALTER TABLE public.uploaded_files ADD COLUMN IF NOT EXISTS user_description text;
ALTER TABLE public.follow_ups ADD COLUMN IF NOT EXISTS related_file_id uuid REFERENCES public.uploaded_files(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_follow_ups_related_file_id ON public.follow_ups(related_file_id);
ALTER TABLE public.pending_actions ADD COLUMN IF NOT EXISTS current_question text;