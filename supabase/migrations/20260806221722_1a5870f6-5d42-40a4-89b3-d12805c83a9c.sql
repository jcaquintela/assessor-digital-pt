REVOKE ALL ON FUNCTION public.purge_admin_audit_logs(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_admin_audit_logs(integer) TO service_role;