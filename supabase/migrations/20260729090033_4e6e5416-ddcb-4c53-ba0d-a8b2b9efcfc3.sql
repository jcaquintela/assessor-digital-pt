-- 1) Enum papel
DO $$ BEGIN
  CREATE TYPE public.person_role AS ENUM (
    'owner','potential_owner','buyer','potential_buyer','client',
    'reference','partner','supplier','colleague','other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Extensão people
ALTER TABLE public.people
  ADD COLUMN IF NOT EXISTS roles public.person_role[] NOT NULL DEFAULT ARRAY[]::public.person_role[],
  ADD COLUMN IF NOT EXISTS company text,
  ADD COLUMN IF NOT EXISTS job_title text,
  ADD COLUMN IF NOT EXISTS source_channel text,
  ADD COLUMN IF NOT EXISTS source_message_id uuid,
  ADD COLUMN IF NOT EXISTS source_file_id uuid,
  ADD COLUMN IF NOT EXISTS search_location text,
  ADD COLUMN IF NOT EXISTS search_property_type text,
  ADD COLUMN IF NOT EXISTS budget_min numeric,
  ADD COLUMN IF NOT EXISTS budget_max numeric,
  ADD COLUMN IF NOT EXISTS referred_by_person_id uuid REFERENCES public.people(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS email_normalized text;

-- Backfill email_normalized
UPDATE public.people SET email_normalized = lower(trim(email)) WHERE email IS NOT NULL AND email_normalized IS NULL;

CREATE INDEX IF NOT EXISTS people_user_email_norm_idx ON public.people(user_id, email_normalized);
CREATE INDEX IF NOT EXISTS people_user_name_idx ON public.people(user_id, lower(name));

-- 3) person_phones
CREATE TABLE IF NOT EXISTS public.person_phones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  raw text NOT NULL,
  e164 text,
  country_code text,
  kind text NOT NULL DEFAULT 'unknown',
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.person_phones TO authenticated;
GRANT ALL ON public.person_phones TO service_role;

ALTER TABLE public.person_phones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "person_phones_owner_all" ON public.person_phones;
CREATE POLICY "person_phones_owner_all" ON public.person_phones
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE UNIQUE INDEX IF NOT EXISTS person_phones_user_e164_idx
  ON public.person_phones(user_id, e164) WHERE e164 IS NOT NULL;
CREATE INDEX IF NOT EXISTS person_phones_person_idx ON public.person_phones(person_id);

-- 4) Backfill: para cada pessoa com phone existente, cria uma entrada em person_phones se não existir
INSERT INTO public.person_phones (user_id, person_id, raw, e164, kind, is_primary)
SELECT p.user_id, p.id, p.phone, NULL, 'unknown', true
FROM public.people p
WHERE p.phone IS NOT NULL AND btrim(p.phone) <> ''
  AND NOT EXISTS (SELECT 1 FROM public.person_phones pp WHERE pp.person_id = p.id);

-- 5) Backfill roles a partir de relationship_type quando roles está vazio
UPDATE public.people
SET roles = ARRAY[
  CASE lower(coalesce(relationship_type,''))
    WHEN 'proprietário' THEN 'owner'::public.person_role
    WHEN 'proprietario' THEN 'owner'::public.person_role
    WHEN 'cliente' THEN 'client'::public.person_role
    WHEN 'comprador' THEN 'buyer'::public.person_role
    WHEN 'potencial' THEN 'potential_buyer'::public.person_role
    WHEN 'potencial comprador' THEN 'potential_buyer'::public.person_role
    WHEN 'referenciador' THEN 'reference'::public.person_role
    WHEN 'referência' THEN 'reference'::public.person_role
    WHEN 'referencia' THEN 'reference'::public.person_role
    WHEN 'colega' THEN 'colleague'::public.person_role
    ELSE 'other'::public.person_role
  END
]
WHERE (roles IS NULL OR cardinality(roles) = 0);

-- 6) Trigger email_normalized
CREATE OR REPLACE FUNCTION public.people_touch_email_norm()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.email_normalized = CASE WHEN NEW.email IS NULL THEN NULL ELSE lower(btrim(NEW.email)) END;
  RETURN NEW;
END;$$;

DROP TRIGGER IF EXISTS people_email_norm_trg ON public.people;
CREATE TRIGGER people_email_norm_trg
  BEFORE INSERT OR UPDATE OF email ON public.people
  FOR EACH ROW EXECUTE FUNCTION public.people_touch_email_norm();