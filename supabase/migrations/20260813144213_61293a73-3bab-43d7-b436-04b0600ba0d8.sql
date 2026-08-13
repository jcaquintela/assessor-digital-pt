-- has_role passa a responder apenas sobre quem pergunta: um utilizador com
-- sessão não consegue sondar os papéis de outra conta.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
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
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  );
END;
$function$;