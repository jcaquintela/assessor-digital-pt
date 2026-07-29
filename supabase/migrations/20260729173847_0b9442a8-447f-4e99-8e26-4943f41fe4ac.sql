CREATE OR REPLACE FUNCTION public.effective_tier(_user_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _role text := current_setting('request.jwt.claim.role', true);
  _result text;
BEGIN
  IF _role IS NULL THEN
    _role := coalesce((current_setting('request.jwt.claims', true)::jsonb ->> 'role'), '');
  END IF;

  -- Chamadas internas do servidor (service_role / conexões diretas sem JWT) mantêm acesso.
  IF _caller IS NOT NULL AND _caller <> _user_id AND _role <> 'service_role' THEN
    IF NOT public.is_admin(_caller) THEN
      RAISE EXCEPTION 'nao autorizado a consultar o plano de outro utilizador';
    END IF;
  END IF;

  IF _caller IS NULL AND _role NOT IN ('service_role', '') THEN
    RAISE EXCEPTION 'nao autorizado';
  END IF;

  SELECT CASE
    WHEN p.is_beta_tester = true
         AND (p.beta_expires_at IS NULL OR p.beta_expires_at > now())
      THEN 'hub'
    ELSE p.subscription_tier
  END
  INTO _result
  FROM public.profiles p
  WHERE p.id = _user_id;

  RETURN _result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.effective_tier(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.tier_at_least(uuid, text) FROM anon;