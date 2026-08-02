-- 1. Categoria FSBO para todos os utilizadores com categorias
INSERT INTO public.property_categories (user_id, name, color)
SELECT DISTINCT user_id, 'FSBO', '#ef4444' FROM public.property_categories
ON CONFLICT (user_id, name) DO NOTHING;

-- 2. Contas novas passam a receber FSBO também
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
    (NEW.id, 'FSBO', '#ef4444'),
    (NEW.id, 'Em estudo', '#8b5cf6'),
    (NEW.id, 'Outros', '#64748b')
  ON CONFLICT (user_id, name) DO NOTHING;

  RETURN NEW;
END;
$function$;

-- 3. Etiqueta que corresponde a uma categoria existente -> categoria (só se o imóvel ainda não tem categoria)
UPDATE public.properties p
SET category_id = pc.id
FROM public.entity_tags et
JOIN public.tags t ON t.id = et.tag_id
JOIN public.property_categories pc ON lower(pc.name) = lower(t.name)
WHERE et.entity_type = 'property' AND et.entity_id = p.id
  AND pc.user_id = p.user_id AND p.category_id IS NULL;

-- 4. Etiquetas restantes (sem categoria correspondente) guardadas nas notas
UPDATE public.properties p
SET notes = trim(both E'\n' from coalesce(p.notes,'') || E'\n' || 'Etiquetas anteriores: ' || x.lista)
FROM (
  SELECT et.entity_id, string_agg(t.name, ', ' ORDER BY t.name) AS lista
  FROM public.entity_tags et
  JOIN public.tags t ON t.id = et.tag_id
  JOIN public.properties pr ON pr.id = et.entity_id
  LEFT JOIN public.property_categories pc ON pc.user_id = pr.user_id AND lower(pc.name) = lower(t.name)
  WHERE et.entity_type = 'property' AND (pc.id IS NULL OR pr.category_id IS DISTINCT FROM pc.id)
  GROUP BY et.entity_id
) x
WHERE x.entity_id = p.id;

-- 5. Imóveis deixam de ter etiquetas (as etiquetas mantêm-se para Pessoas)
DELETE FROM public.entity_tags WHERE entity_type = 'property';