CREATE OR REPLACE FUNCTION public.profiles_restrict_self_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('role', true) = 'service_role'
     OR coalesce(current_setting('app.system_job', true), '') = 'on'
     OR public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF NEW.subscription_tier IS DISTINCT FROM OLD.subscription_tier
     OR NEW.is_beta_tester IS DISTINCT FROM OLD.is_beta_tester
     OR NEW.beta_expires_at IS DISTINCT FROM OLD.beta_expires_at
     OR NEW.account_kind IS DISTINCT FROM OLD.account_kind
     OR NEW.phone_verified_at IS DISTINCT FROM OLD.phone_verified_at
     OR NEW.whatsapp_link_status IS DISTINCT FROM OLD.whatsapp_link_status
     OR NEW.whatsapp_linked_at IS DISTINCT FROM OLD.whatsapp_linked_at THEN
    RAISE EXCEPTION 'Não podes alterar campos privilegiados do perfil diretamente.';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.expire_beta_testers()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  n integer := 0;
BEGIN
  PERFORM set_config('app.system_job', 'on', true);
  FOR r IN
    SELECT id, subscription_tier, beta_expires_at
    FROM public.profiles
    WHERE is_beta_tester = true
      AND beta_expires_at IS NOT NULL
      AND beta_expires_at < now()
  LOOP
    UPDATE public.profiles
       SET subscription_tier = 'base', is_beta_tester = false
     WHERE id = r.id;

    INSERT INTO public.admin_audit_logs
      (admin_user_id, action, target_user_id, resource_type, resource_id, reason, metadata)
    VALUES (
      NULL,
      'beta.expired_auto',
      r.id,
      'profile',
      r.id::text,
      'Período de teste terminado automaticamente.',
      jsonb_build_object(
        'before', jsonb_build_object('subscription_tier', r.subscription_tier, 'is_beta_tester', true, 'beta_expires_at', r.beta_expires_at),
        'after', jsonb_build_object('subscription_tier', 'base', 'is_beta_tester', false),
        'source', 'cron:expire_beta_testers'
      )
    );
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$function$;

REVOKE ALL ON FUNCTION public.expire_beta_testers() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_beta_testers() TO service_role;