CREATE TABLE public.property_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  color text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_categories TO authenticated;
GRANT ALL ON public.property_categories TO service_role;

ALTER TABLE public.property_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Consultor gere as suas categorias de imoveis"
  ON public.property_categories
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER property_categories_touch
  BEFORE UPDATE ON public.property_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.properties
  ADD COLUMN category_id uuid REFERENCES public.property_categories(id) ON DELETE SET NULL;

CREATE INDEX properties_category_id_idx ON public.properties (category_id);

-- Sugestoes de partida para contas existentes que ainda nao tenham categorias.
INSERT INTO public.property_categories (user_id, name, color)
SELECT p.id, d.name, d.color
FROM public.profiles p
CROSS JOIN (VALUES
  ('Angariação própria', '#22c55e'),
  ('Pré-angariação', '#f59e0b'),
  ('De colega/agência', '#3b82f6'),
  ('Em estudo', '#8b5cf6'),
  ('Outros', '#64748b')
) AS d(name, color)
WHERE NOT EXISTS (
  SELECT 1 FROM public.property_categories c WHERE c.user_id = p.id
)
ON CONFLICT (user_id, name) DO NOTHING;

-- Contas novas recebem as mesmas sugestoes de partida.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1))
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role, created_by)
  VALUES (NEW.id, 'consultant', NEW.id)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.property_categories (user_id, name, color)
  VALUES
    (NEW.id, 'Angariação própria', '#22c55e'),
    (NEW.id, 'Pré-angariação', '#f59e0b'),
    (NEW.id, 'De colega/agência', '#3b82f6'),
    (NEW.id, 'Em estudo', '#8b5cf6'),
    (NEW.id, 'Outros', '#64748b')
  ON CONFLICT (user_id, name) DO NOTHING;

  RETURN NEW;
END;
$function$;