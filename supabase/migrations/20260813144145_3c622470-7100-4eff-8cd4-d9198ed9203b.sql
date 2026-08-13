-- Não é usada por nenhuma regra de acesso nem pela app: fica só do lado do servidor.
REVOKE ALL ON FUNCTION public.tier_at_least(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tier_at_least(uuid, text) TO service_role;