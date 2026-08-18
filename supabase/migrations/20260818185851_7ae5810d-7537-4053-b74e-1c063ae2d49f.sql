ALTER TABLE public.miscellaneous_items
  ADD COLUMN IF NOT EXISTS item_class text NOT NULL DEFAULT 'genuino';

ALTER TABLE public.miscellaneous_items
  DROP CONSTRAINT IF EXISTS miscellaneous_items_item_class_check;

ALTER TABLE public.miscellaneous_items
  ADD CONSTRAINT miscellaneous_items_item_class_check
  CHECK (item_class IN ('genuino','falha_interpretacao'));

CREATE INDEX IF NOT EXISTS miscellaneous_items_item_class_idx
  ON public.miscellaneous_items (user_id, item_class, created_at DESC);