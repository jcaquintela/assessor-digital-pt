ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_account_kind_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_account_kind_check
  CHECK (account_kind = ANY (ARRAY['real'::text, 'demo'::text, 'merged'::text]));

CREATE OR REPLACE FUNCTION public.merge_accounts_apply(_source uuid, _target uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  t text;
  ctids tid[];
  c tid;
  moved bigint;
  skipped bigint;
  result jsonb := '[]'::jsonb;
  src record;
  tgt record;
BEGIN
  IF _source IS NULL OR _target IS NULL OR _source = _target THEN
    RAISE EXCEPTION 'contas de origem e destino inválidas';
  END IF;

  SELECT * INTO src FROM public.profiles WHERE id = _source;
  IF NOT FOUND THEN RAISE EXCEPTION 'conta de origem inexistente'; END IF;
  SELECT * INTO tgt FROM public.profiles WHERE id = _target;
  IF NOT FOUND THEN RAISE EXCEPTION 'conta de destino inexistente'; END IF;

  PERFORM set_config('app.system_job', 'on', true);

  FOR t IN
    SELECT c2.table_name
    FROM information_schema.columns c2
    JOIN information_schema.tables tb
      ON tb.table_schema = c2.table_schema AND tb.table_name = c2.table_name
    WHERE c2.table_schema = 'public'
      AND c2.column_name = 'user_id'
      AND tb.table_type = 'BASE TABLE'
    ORDER BY 1
  LOOP
    moved := 0;
    skipped := 0;
    EXECUTE format('SELECT coalesce(array_agg(ctid), ''{}''::tid[]) FROM public.%I WHERE user_id = $1', t)
      INTO ctids USING _source;

    FOREACH c IN ARRAY ctids LOOP
      BEGIN
        EXECUTE format('UPDATE public.%I SET user_id = $1 WHERE ctid = $2', t)
          USING _target, c;
        moved := moved + 1;
      EXCEPTION WHEN unique_violation OR foreign_key_violation THEN
        EXECUTE format('DELETE FROM public.%I WHERE ctid = $1', t) USING c;
        skipped := skipped + 1;
      END;
    END LOOP;

    IF moved > 0 OR skipped > 0 THEN
      result := result || jsonb_build_object('table', t, 'moved', moved, 'discarded', skipped);
    END IF;
  END LOOP;

  -- Liberta o contacto da conta de origem antes de o passar para o destino.
  UPDATE public.profiles
     SET phone = NULL,
         phone_verified_at = NULL,
         whatsapp_link_status = 'unlinked',
         whatsapp_linked_at = NULL,
         updated_at = now()
   WHERE id = _source;

  UPDATE public.profiles
     SET phone = coalesce(tgt.phone, src.phone),
         phone_verified_at = coalesce(tgt.phone_verified_at, src.phone_verified_at),
         whatsapp_link_status = CASE
           WHEN tgt.whatsapp_link_status = 'linked' THEN tgt.whatsapp_link_status
           ELSE coalesce(src.whatsapp_link_status, tgt.whatsapp_link_status)
         END,
         whatsapp_linked_at = coalesce(tgt.whatsapp_linked_at, src.whatsapp_linked_at),
         primary_channel = coalesce(tgt.primary_channel, src.primary_channel),
         assessor_name = coalesce(tgt.assessor_name, src.assessor_name),
         name = coalesce(tgt.name, src.name),
         subscription_tier = CASE
           WHEN src.subscription_tier = 'hub' OR tgt.subscription_tier = 'hub' THEN 'hub'
           WHEN src.subscription_tier = 'pro' OR tgt.subscription_tier = 'pro' THEN 'pro'
           WHEN src.subscription_tier = 'consultor' OR tgt.subscription_tier = 'consultor' THEN 'consultor'
           ELSE coalesce(tgt.subscription_tier, 'base')
         END,
         is_beta_tester = coalesce(tgt.is_beta_tester, false) OR coalesce(src.is_beta_tester, false),
         beta_expires_at = greatest(
           coalesce(tgt.beta_expires_at, src.beta_expires_at),
           coalesce(src.beta_expires_at, tgt.beta_expires_at)
         ),
         updated_at = now()
   WHERE id = _target;

  UPDATE public.profiles
     SET subscription_tier = 'base',
         is_beta_tester = false,
         beta_expires_at = NULL,
         account_kind = 'merged',
         readonly_until = 'infinity'::timestamptz,
         updated_at = now()
   WHERE id = _source;

  RETURN jsonb_build_object('source', _source, 'target', _target, 'tables', result);
END;
$function$;

DO $$
DECLARE r jsonb;
BEGIN
  r := public.merge_accounts_apply('e6a2f985-5ed5-4940-9202-d5253b505a38'::uuid, 'df098797-b532-40bb-a298-003ef99fe81a'::uuid);
  INSERT INTO public.admin_audit_logs (admin_user_id, action, target_user_id, resource_type, resource_id, reason, metadata)
  VALUES (NULL, 'accounts.merged', 'df098797-b532-40bb-a298-003ef99fe81a', 'profile', 'e6a2f985-5ed5-4940-9202-d5253b505a38',
          'Desbloqueio manual: conta do WhatsApp 351917862040 e conta de email do Pedro Cunha sao a mesma pessoa.',
          jsonb_build_object('moved', r, 'source', 'manual:migration'));

  r := public.merge_accounts_apply('5c06fcf5-c45a-4175-b0b3-93ecd7baf512'::uuid, '0338b619-ea20-4167-9242-741491a57012'::uuid);
  INSERT INTO public.admin_audit_logs (admin_user_id, action, target_user_id, resource_type, resource_id, reason, metadata)
  VALUES (NULL, 'accounts.merged', '0338b619-ea20-4167-9242-741491a57012', 'profile', '5c06fcf5-c45a-4175-b0b3-93ecd7baf512',
          'Desbloqueio manual: conta do WhatsApp 351910220143 e conta de email do nunocastilho sao a mesma pessoa.',
          jsonb_build_object('moved', r, 'source', 'manual:migration'));
END $$;