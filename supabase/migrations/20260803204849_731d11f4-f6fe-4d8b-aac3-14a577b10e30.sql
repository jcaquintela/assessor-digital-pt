-- has_role e tier_at_least não são chamadas pela aplicação; ficam internas.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;

REVOKE EXECUTE ON FUNCTION public.tier_at_least(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tier_at_least(uuid, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.effective_tier(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.effective_tier(uuid) TO authenticated, service_role;

-- is_admin é usada em 29 políticas RLS, por isso continua executável;
-- mas uma chamada direta de um utilizador só pode perguntar por si próprio.
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
BEGIN
  IF _caller IS NOT NULL AND _user_id IS DISTINCT FROM _caller THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('super_admin','support_admin')
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated, service_role;