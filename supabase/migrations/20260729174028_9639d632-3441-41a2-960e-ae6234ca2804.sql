REVOKE EXECUTE ON FUNCTION public.effective_tier(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tier_at_least(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.effective_tier(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tier_at_least(uuid, text) TO authenticated, service_role;