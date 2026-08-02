CREATE TABLE public.product_updates (
  id uuid primary key default gen_random_uuid(),
  released_on date not null default current_date,
  title text not null,
  description text not null,
  category text not null default 'nova_funcionalidade',
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

GRANT SELECT ON public.product_updates TO authenticated;
GRANT ALL ON public.product_updates TO service_role;

ALTER TABLE public.product_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_updates_read_authenticated"
ON public.product_updates FOR SELECT TO authenticated
USING (is_published = true);

CREATE POLICY "product_updates_admin_manage"
ON public.product_updates FOR ALL TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER product_updates_touch
BEFORE UPDATE ON public.product_updates
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.product_updates_validate()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.category NOT IN ('nova_funcionalidade','melhoria','correcao') THEN
    RAISE EXCEPTION 'categoria de novidade invalida: %', NEW.category;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER product_updates_validate_trg
BEFORE INSERT OR UPDATE ON public.product_updates
FOR EACH ROW EXECUTE FUNCTION public.product_updates_validate();

CREATE INDEX product_updates_released_idx ON public.product_updates (released_on DESC);