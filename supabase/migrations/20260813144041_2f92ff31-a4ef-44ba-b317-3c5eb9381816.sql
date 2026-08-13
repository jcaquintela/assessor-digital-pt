-- Nenhuma função interna deve ser chamável por quem não tem sessão iniciada.
REVOKE ALL ON FUNCTION public.audit_sensitive_write() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.effective_tier(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tier_at_least(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.expire_beta_testers() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.merge_accounts_apply(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.merge_accounts_preview(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_admin_audit_logs(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_conversation_lock(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.try_acquire_conversation_lock(uuid, text, integer, text) FROM PUBLIC, anon, authenticated;

-- O necessário e nada mais: verificação de administrador e escalão de
-- subscrição são usados pelas regras de acesso e pela app com sessão.
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.effective_tier(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tier_at_least(uuid, text) TO authenticated;

-- Operações administrativas e de manutenção só pelo lado do servidor.
GRANT EXECUTE ON FUNCTION public.merge_accounts_apply(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.merge_accounts_preview(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_admin_audit_logs(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_beta_testers() TO service_role;
GRANT EXECUTE ON FUNCTION public.release_conversation_lock(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.try_acquire_conversation_lock(uuid, text, integer, text) TO service_role;