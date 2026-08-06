ALTER TABLE public.uploaded_files
  ADD COLUMN IF NOT EXISTS doc_group_id uuid,
  ADD COLUMN IF NOT EXISTS doc_page_number integer;

CREATE INDEX IF NOT EXISTS uploaded_files_doc_group_idx
  ON public.uploaded_files (user_id, doc_group_id)
  WHERE doc_group_id IS NOT NULL;

INSERT INTO public.product_updates (released_on, title, description, category, is_published)
VALUES (
  current_date,
  'Documentos de várias páginas',
  'Quando envias várias fotos seguidas do mesmo documento (por exemplo, as páginas de uma caderneta predial), o Afonso junta-as num só documento e liga tudo ao mesmo imóvel, sem voltar a perguntar em cada página.',
  'melhoria',
  true
);