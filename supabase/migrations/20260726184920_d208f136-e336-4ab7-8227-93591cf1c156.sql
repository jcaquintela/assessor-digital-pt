REVOKE EXECUTE ON FUNCTION public.pending_actions_validate() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.conversation_states_touch() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pending_actions_validate() TO service_role;
GRANT EXECUTE ON FUNCTION public.conversation_states_touch() TO service_role;