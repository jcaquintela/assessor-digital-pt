
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS typology text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS parish text,
  ADD COLUMN IF NOT EXISTS asking_price numeric(12,2),
  ADD COLUMN IF NOT EXISTS estimated_value numeric(12,2),
  ADD COLUMN IF NOT EXISTS area_gross numeric(10,2),
  ADD COLUMN IF NOT EXISTS area_useful numeric(10,2),
  ADD COLUMN IF NOT EXISTS bedrooms integer,
  ADD COLUMN IF NOT EXISTS bathrooms integer,
  ADD COLUMN IF NOT EXISTS parking integer,
  ADD COLUMN IF NOT EXISTS energy_rating text,
  ADD COLUMN IF NOT EXISTS source_channel text,
  ADD COLUMN IF NOT EXISTS source_message_id uuid;

ALTER TABLE public.properties
  ALTER COLUMN property_type DROP NOT NULL,
  ALTER COLUMN property_type DROP DEFAULT;

CREATE INDEX IF NOT EXISTS properties_user_city_idx ON public.properties (user_id, city);
CREATE INDEX IF NOT EXISTS properties_user_typology_idx ON public.properties (user_id, typology);

ALTER TABLE public.uploaded_files
  ADD COLUMN IF NOT EXISTS document_type text,
  ADD COLUMN IF NOT EXISTS classification_confidence numeric;

ALTER TABLE public.conversation_states
  ADD COLUMN IF NOT EXISTS last_property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL;
