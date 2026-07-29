-- Enums
DO $$ BEGIN
  CREATE TYPE public.prospecting_source_type AS ENUM (
    'street_sign','referral','online_listing','direct_observation','other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.prospecting_listing_type AS ENUM (
    'owner_sale','other_agency','own_agency','unknown'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.prospecting_status AS ENUM (
    'to_contact','contact_attempted','contacted','no_interest','opportunity','converted','archived'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tabela
CREATE TABLE IF NOT EXISTS public.prospecting_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  phone text,
  location text,
  address text,
  source_type public.prospecting_source_type NOT NULL DEFAULT 'other',
  listing_type public.prospecting_listing_type NOT NULL DEFAULT 'unknown',
  agency_name text,
  contact_name text,
  property_type text,
  typology text,
  asking_price numeric,
  status public.prospecting_status NOT NULL DEFAULT 'to_contact',
  notes text,
  source_channel text NOT NULL DEFAULT 'web',
  source_message_id uuid,
  image_file_id uuid REFERENCES public.uploaded_files(id) ON DELETE SET NULL,
  related_property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  related_person_id uuid REFERENCES public.people(id) ON DELETE SET NULL,
  next_follow_up_at timestamptz,
  extraction_confidence numeric,
  extraction_raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  contact_attempts integer NOT NULL DEFAULT 0,
  last_contact_attempt_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS prospecting_leads_user_status_idx
  ON public.prospecting_leads(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS prospecting_leads_user_phone_idx
  ON public.prospecting_leads(user_id, phone);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prospecting_leads TO authenticated;
GRANT ALL ON public.prospecting_leads TO service_role;

ALTER TABLE public.prospecting_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prospecting_leads_owner_all"
  ON public.prospecting_leads
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER prospecting_leads_set_updated_at
  BEFORE UPDATE ON public.prospecting_leads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Ligação a seguimentos
ALTER TABLE public.follow_ups
  ADD COLUMN IF NOT EXISTS related_prospecting_lead_id uuid
    REFERENCES public.prospecting_leads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS follow_ups_prospecting_idx
  ON public.follow_ups(related_prospecting_lead_id)
  WHERE related_prospecting_lead_id IS NOT NULL;