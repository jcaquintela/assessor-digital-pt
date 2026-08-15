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
     OR NEW.whatsapp_linked_at IS DISTINCT FROM OLD.whatsapp_linked_at
     OR NEW.trial_started_at IS DISTINCT FROM OLD.trial_started_at
     OR NEW.trial_expires_at IS DISTINCT FROM OLD.trial_expires_at
     OR NEW.trial_tier IS DISTINCT FROM OLD.trial_tier
     OR NEW.trial_status IS DISTINCT FROM OLD.trial_status
     OR NEW.trial_warned_at IS DISTINCT FROM OLD.trial_warned_at
     OR NEW.telegram_retention_warned_at IS DISTINCT FROM OLD.telegram_retention_warned_at
     OR NEW.billing_status IS DISTINCT FROM OLD.billing_status
     OR NEW.billing_source IS DISTINCT FROM OLD.billing_source
     OR NEW.billing_environment IS DISTINCT FROM OLD.billing_environment
     OR NEW.billing_manual_lock IS DISTINCT FROM OLD.billing_manual_lock
     OR NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id
     OR NEW.stripe_subscription_id IS DISTINCT FROM OLD.stripe_subscription_id
     OR NEW.stripe_price_id IS DISTINCT FROM OLD.stripe_price_id THEN
    RAISE EXCEPTION 'Não podes alterar campos privilegiados do perfil diretamente.';
  END IF;

  RETURN NEW;
END;
$function$;