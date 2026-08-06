-- Fusão de contas duplicadas (shadow WhatsApp/Telegram <-> conta de email).
-- Funções internas: apenas o servidor (service_role) as pode executar.

CREATE OR REPLACE FUNCTION public.merge_accounts_preview(_source uuid)
RETURNS TABLE(table_name text, rows bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t text;
  n bigint;
BEGIN
  FOR t IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables tb
      ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND c.column_name = 'user_id'
      AND tb.table_type = 'BASE TABLE'
    ORDER BY 1
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE user_id = $1', t)
      INTO n USING _source;
    IF n > 0 THEN
      table_name := t;
      rows := n;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.merge_accounts_apply(_source uuid, _target uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
        -- linha equivalente já existe na conta de destino: descarta a duplicada.
        EXECUTE format('DELETE FROM public.%I WHERE ctid = $1', t) USING c;
        skipped := skipped + 1;
      END;
    END LOOP;

    IF moved > 0 OR skipped > 0 THEN
      result := result || jsonb_build_object('table', t, 'moved', moved, 'discarded', skipped);
    END IF;
  END LOOP;

  -- Contacto e estado do canal passam para a conta de destino.
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

  -- A conta de origem fica inactiva (nada é apagado).
  UPDATE public.profiles
     SET subscription_tier = 'base',
         is_beta_tester = false,
         beta_expires_at = NULL,
         phone = NULL,
         phone_verified_at = NULL,
         whatsapp_link_status = 'unlinked',
         whatsapp_linked_at = NULL,
         primary_channel = NULL,
         account_kind = 'merged',
         readonly_until = 'infinity'::timestamptz,
         updated_at = now()
   WHERE id = _source;

  RETURN jsonb_build_object('source', _source, 'target', _target, 'tables', result);
END;
$$;

REVOKE ALL ON FUNCTION public.merge_accounts_preview(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.merge_accounts_apply(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_accounts_preview(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.merge_accounts_apply(uuid, uuid) TO service_role;