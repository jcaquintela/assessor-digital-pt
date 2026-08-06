
CREATE OR REPLACE FUNCTION public.audit_sensitive_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _row jsonb;
  _old jsonb;
  _target uuid;
  _actor uuid := auth.uid();
  _res text;
  _secret text;
  _secrets text[] := ARRAY[
    'connection_key_ciphertext','refresh_token_encrypted','code_hash','token','access_token'
  ];
BEGIN
  _row := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  _old := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END;

  FOREACH _secret IN ARRAY _secrets LOOP
    IF _row ? _secret THEN
      _row := jsonb_set(_row, ARRAY[_secret], to_jsonb('[oculto]'::text));
    END IF;
    IF _old IS NOT NULL AND _old ? _secret THEN
      _old := jsonb_set(_old, ARRAY[_secret], to_jsonb('[oculto]'::text));
    END IF;
  END LOOP;

  IF _row ? 'user_id' THEN
    _target := (_row ->> 'user_id')::uuid;
  ELSIF _row ? 'target_user_id' THEN
    _target := (_row ->> 'target_user_id')::uuid;
  END IF;

  _res := coalesce(_row ->> 'id', _row ->> 'token', _row ->> 'key');
  IF TG_TABLE_NAME IN ('dashboard_login_tokens','telegram_link_tokens') THEN
    _res := left(coalesce(_res, ''), 6) || '…';
  END IF;

  INSERT INTO public.admin_audit_logs
    (admin_user_id, action, target_user_id, resource_type, resource_id, reason, metadata)
  VALUES (
    _actor,
    'sensivel.' || TG_TABLE_NAME || '.' || lower(TG_OP),
    _target,
    TG_TABLE_NAME,
    _res,
    NULL,
    jsonb_build_object(
      'source', 'trigger:audit_sensitive_write',
      'db_role', current_setting('role', true),
      'system_job', coalesce(current_setting('app.system_job', true), 'off'),
      'after', CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE _row END,
      'before', _old
    )
  );

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'app_user_connections','app_user_connection_aliases','calendar_connections',
    'dashboard_login_tokens','telegram_link_tokens','whatsapp_link_codes',
    'support_sessions','ai_model_rates','whatsapp_template_rates','admin_cost_settings'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_sensitive_write ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER audit_sensitive_write AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_sensitive_write()', t);
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS admin_audit_logs_action_created_idx
  ON public.admin_audit_logs (action, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_logs_resource_type_idx
  ON public.admin_audit_logs (resource_type, created_at DESC);

CREATE OR REPLACE FUNCTION public.purge_admin_audit_logs(_keep_days integer DEFAULT 730)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE n integer;
BEGIN
  DELETE FROM public.admin_audit_logs
   WHERE created_at < now() - make_interval(days => _keep_days);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
