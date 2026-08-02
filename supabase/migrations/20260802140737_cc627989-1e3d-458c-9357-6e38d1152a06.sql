ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS reserved_at timestamptz,
  ADD COLUMN IF NOT EXISTS sold_at timestamptz,
  ADD COLUMN IF NOT EXISTS sale_price numeric,
  ADD COLUMN IF NOT EXISTS commission_pct numeric,
  ADD COLUMN IF NOT EXISTS commission_amount numeric;

ALTER TABLE public.interactions ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS interactions_property_idx ON public.interactions(property_id);

CREATE TABLE public.property_interests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  opportunity_id uuid REFERENCES public.opportunities(id) ON DELETE SET NULL,
  person_id uuid REFERENCES public.people(id) ON DELETE SET NULL,
  name text NOT NULL,
  contact text,
  source text,
  status text NOT NULL DEFAULT 'a_contactar',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_interests TO authenticated;
GRANT ALL ON public.property_interests TO service_role;
ALTER TABLE public.property_interests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own property_interests" ON public.property_interests FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER property_interests_touch BEFORE UPDATE ON public.property_interests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX IF NOT EXISTS property_interests_prop_idx ON public.property_interests(property_id);

CREATE TABLE public.property_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  opportunity_id uuid REFERENCES public.opportunities(id) ON DELETE SET NULL,
  person_id uuid REFERENCES public.people(id) ON DELETE SET NULL,
  from_name text,
  amount numeric NOT NULL,
  offer_date timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pendente',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_offers TO authenticated;
GRANT ALL ON public.property_offers TO service_role;
ALTER TABLE public.property_offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own property_offers" ON public.property_offers FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER property_offers_touch BEFORE UPDATE ON public.property_offers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX IF NOT EXISTS property_offers_prop_idx ON public.property_offers(property_id);

CREATE TABLE public.property_marketing_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  opportunity_id uuid REFERENCES public.opportunities(id) ON DELETE SET NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'por_fazer',
  done_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_marketing_activities TO authenticated;
GRANT ALL ON public.property_marketing_activities TO service_role;
ALTER TABLE public.property_marketing_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own property_marketing" ON public.property_marketing_activities FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER property_marketing_touch BEFORE UPDATE ON public.property_marketing_activities
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX IF NOT EXISTS property_marketing_prop_idx ON public.property_marketing_activities(property_id);