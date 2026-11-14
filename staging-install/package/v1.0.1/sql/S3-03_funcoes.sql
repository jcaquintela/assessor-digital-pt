-- S3-03 · funções
-- AFONSO V2 · pacote de instalação v1.0.1 · destino ÚNICO: AFONSO Staging.
-- Gerado por scripts/staging/build-staging-package-v101.ts a partir do estado final do esquema
-- (staging-install/rehearsal/results/schema_public.sql, sha256 e047c2e1fe0effb5…).
-- Só DDL aditivo: sem INSERT/UPDATE/DELETE, sem DROP, sem RENAME, sem DROP NOT NULL, sem instruções SET de sessão.
-- NÃO EXECUTAR na V1 (produção). Aplicar só com autorização, por ordem, um ficheiro por migração.
-- Cada função perde EXECUTE para PUBLIC/anon/authenticated logo a seguir à criação; só service_role a executa.

-- ----- função public.access_invites_pilot_guard() -----
CREATE FUNCTION public.access_invites_pilot_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE _via_fn boolean := coalesce(current_setting('afonso.pilot_invite_write', true), '') = 'on';
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.source = 'pilot' AND NOT _via_fn THEN
      RAISE EXCEPTION 'pilot invites are issued only through issue_pilot_invite' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.source = 'pilot' OR NEW.source = 'pilot' THEN
    IF NEW.source IS DISTINCT FROM OLD.source OR NEW.pilot_key IS DISTINCT FROM OLD.pilot_key
       OR NEW.token_hash IS DISTINCT FROM OLD.token_hash OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
       OR NEW.issuer_user_id IS DISTINCT FROM OLD.issuer_user_id OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key THEN
      RAISE EXCEPTION 'pilot invite fields are immutable' USING ERRCODE = '42501';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NOT (OLD.status = 'issued' AND (NEW.status = 'used' OR (NEW.status = 'revoked' AND _via_fn))) THEN
        RAISE EXCEPTION 'pilot invite status change not allowed' USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.access_invites_pilot_guard() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.access_invites_pilot_guard() TO service_role;

-- ----- função public.account_access_on_new_profile() -----
CREATE FUNCTION public.account_access_on_new_profile() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.feature_flags
             WHERE key = 'access.early_access_gate.v1' AND enabled_globally = true) THEN
    INSERT INTO public.account_access (user_id, state, source)
    VALUES (NEW.id, 'registered_waiting', 'signup') ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.account_access_on_new_profile() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_access_on_new_profile() TO service_role;

-- ----- função public.audit_sensitive_write() -----
CREATE FUNCTION public.audit_sensitive_write() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
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
REVOKE ALL ON FUNCTION public.audit_sensitive_write() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.audit_sensitive_write() TO service_role;

-- ----- função public.claim_inbound_message(text, text, integer) -----
CREATE FUNCTION public.claim_inbound_message(_channel text, _external_id text, _stale_seconds integer DEFAULT 600) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE _ok boolean;
BEGIN
  IF _channel IS NULL OR _external_id IS NULL OR length(_external_id) = 0 THEN
    RETURN true;
  END IF;
  INSERT INTO public.inbound_message_claims AS c (channel, external_message_id)
  VALUES (_channel, _external_id)
  ON CONFLICT (channel, external_message_id) DO UPDATE
    SET claimed_at = now(), attempts = c.attempts + 1
    WHERE c.claimed_at < now() - make_interval(secs => greatest(_stale_seconds, 60))
      AND NOT EXISTS (SELECT 1 FROM public.assessor_messages m WHERE m.whatsapp_message_id = _external_id)
  RETURNING true INTO _ok;
  RETURN coalesce(_ok, false);
END $$;
REVOKE ALL ON FUNCTION public.claim_inbound_message(text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_inbound_message(text, text, integer) TO service_role;

-- ----- função public.claim_pending_confirmation(uuid, uuid[], text, integer) -----
CREATE FUNCTION public.claim_pending_confirmation(_user_id uuid, _ids uuid[], _token text, _ttl_seconds integer DEFAULT 120) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _n integer;
BEGIN
  UPDATE public.pending_actions
     SET confirm_token = _token,
         confirm_token_at = now()
   WHERE user_id = _user_id
     AND id = ANY(_ids)
     AND status IN ('pending_confirmation','collecting_information','correction_pending')
     AND (confirm_token IS NULL
          OR confirm_token = _token
          OR confirm_token_at < now() - make_interval(secs => _ttl_seconds));
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_pending_confirmation(uuid, uuid[], text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pending_confirmation(uuid, uuid[], text, integer) TO service_role;

-- ----- função public.consultant_preferences_track_opt_ins() -----
CREATE FUNCTION public.consultant_preferences_track_opt_ins() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.proactive_push_enabled IS TRUE AND NOT ('push' = ANY(NEW.explicit_opt_ins)) THEN
      NEW.explicit_opt_ins := array_append(NEW.explicit_opt_ins, 'push');
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.morning_briefing_enabled IS DISTINCT FROM OLD.morning_briefing_enabled THEN
    NEW.explicit_opt_ins := array_remove(NEW.explicit_opt_ins, 'morning_briefing');
    IF NEW.morning_briefing_enabled IS TRUE THEN
      NEW.explicit_opt_ins := array_append(NEW.explicit_opt_ins, 'morning_briefing');
    END IF;
  END IF;
  IF NEW.evening_wrap_enabled IS DISTINCT FROM OLD.evening_wrap_enabled THEN
    NEW.explicit_opt_ins := array_remove(NEW.explicit_opt_ins, 'evening_review');
    IF NEW.evening_wrap_enabled IS TRUE THEN
      NEW.explicit_opt_ins := array_append(NEW.explicit_opt_ins, 'evening_review');
    END IF;
  END IF;
  IF NEW.proactive_push_enabled IS DISTINCT FROM OLD.proactive_push_enabled THEN
    NEW.explicit_opt_ins := array_remove(NEW.explicit_opt_ins, 'push');
    IF NEW.proactive_push_enabled IS TRUE THEN
      NEW.explicit_opt_ins := array_append(NEW.explicit_opt_ins, 'push');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.consultant_preferences_track_opt_ins() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consultant_preferences_track_opt_ins() TO service_role;

-- ----- função public.consume_access_invite(text, uuid, text) -----
CREATE FUNCTION public.consume_access_invite(_token_hash text, _user_id uuid, _channel text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE _id uuid;
BEGIN
  UPDATE public.access_invites
     SET status = 'used', used_by = _user_id, used_at = now(), used_channel = _channel
   WHERE token_hash = _token_hash AND status = 'issued' AND expires_at > now()
     AND (issuer_user_id IS NULL OR issuer_user_id <> _user_id)
  RETURNING id INTO _id;
  IF _id IS NULL THEN RETURN NULL; END IF;
  INSERT INTO public.account_access (user_id, state, invite_id, source, activated_at, updated_at)
  VALUES (_user_id, 'activated', _id, 'invite', now(), now())
  ON CONFLICT (user_id) DO UPDATE
    SET state = 'activated', invite_id = _id, source = 'invite', activated_at = now(), updated_at = now()
    WHERE public.account_access.state IN ('registered_waiting','invited');
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.consume_access_invite(text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_access_invite(text, uuid, text) TO service_role;

-- ----- função public.content_access_consents_validate() -----
CREATE FUNCTION public.content_access_consents_validate() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.status NOT IN ('pending','approved','denied','revoked','expired') THEN
    RAISE EXCEPTION 'estado de consentimento invalido: %', NEW.status;
  END IF;
  IF NEW.status = 'approved' AND NEW.expires_at IS NULL THEN
    NEW.expires_at = now() + interval '2 hours';
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.content_access_consents_validate() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.content_access_consents_validate() TO service_role;

-- ----- função public.conversation_states_touch() -----
CREATE FUNCTION public.conversation_states_touch() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.conversation_states_touch() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.conversation_states_touch() TO service_role;

-- ----- função public.daily_digests_validate() -----
CREATE FUNCTION public.daily_digests_validate() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.status NOT IN ('rascunho','aprovado','enviado','sem_novidades','falhou') THEN
    RAISE EXCEPTION 'estado de resumo diario invalido: %', NEW.status;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.daily_digests_validate() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.daily_digests_validate() TO service_role;

-- ----- função public.is_admin(uuid) -----
CREATE FUNCTION public.is_admin(_user_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _caller uuid := auth.uid();
BEGIN
  IF _caller IS NOT NULL AND _user_id IS DISTINCT FROM _caller THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('super_admin','support_admin')
  );
END;
$$;
REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO service_role;

-- ----- função public.effective_tier(uuid) -----
CREATE FUNCTION public.effective_tier(_user_id uuid) RETURNS text
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _caller uuid := auth.uid();
  _role text := current_setting('request.jwt.claim.role', true);
  _result text;
BEGIN
  IF _role IS NULL THEN
    _role := coalesce((current_setting('request.jwt.claims', true)::jsonb ->> 'role'), '');
  END IF;

  -- Chamadas internas do servidor (service_role / conexões diretas sem JWT) mantêm acesso.
  IF _caller IS NOT NULL AND _caller <> _user_id AND _role <> 'service_role' THEN
    IF NOT public.is_admin(_caller) THEN
      RAISE EXCEPTION 'nao autorizado a consultar o plano de outro utilizador';
    END IF;
  END IF;

  IF _caller IS NULL AND _role NOT IN ('service_role', '') THEN
    RAISE EXCEPTION 'nao autorizado';
  END IF;

  SELECT CASE
    WHEN p.is_beta_tester = true
         AND (p.beta_expires_at IS NULL OR p.beta_expires_at > now())
      THEN 'hub'
    ELSE p.subscription_tier
  END
  INTO _result
  FROM public.profiles p
  WHERE p.id = _user_id;

  RETURN _result;
END;
$$;
REVOKE ALL ON FUNCTION public.effective_tier(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.effective_tier(uuid) TO service_role;

-- ----- função public.email_drafts_validate() -----
CREATE FUNCTION public.email_drafts_validate() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.status NOT IN ('pending','confirmed','discarded','sent','cancelled') THEN
    RAISE EXCEPTION 'estado de rascunho inválido: %', NEW.status;
  END IF;
  IF NEW.kind NOT IN ('reply','outbound') THEN
    RAISE EXCEPTION 'tipo de rascunho inválido: %', NEW.kind;
  END IF;
  IF NEW.status IN ('confirmed','sent') AND NEW.confirmed_at IS NULL THEN
    NEW.confirmed_at := now();
  END IF;
  IF NEW.status = 'cancelled' AND NEW.cancelled_at IS NULL THEN
    NEW.cancelled_at := now();
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.email_drafts_validate() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_drafts_validate() TO service_role;

-- ----- função public.expire_beta_testers() -----
CREATE FUNCTION public.expire_beta_testers() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;
REVOKE ALL ON FUNCTION public.expire_beta_testers() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_beta_testers() TO service_role;

-- ----- função public.handle_new_user() -----
CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1))
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role, created_by)
  VALUES (NEW.id, 'consultant', NEW.id)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.property_categories (user_id, name, color)
  VALUES
    (NEW.id, 'Angariação própria', '#22c55e'),
    (NEW.id, 'Pré-angariação', '#f59e0b'),
    (NEW.id, 'De colega/agência', '#3b82f6'),
    (NEW.id, 'FSBO', '#ef4444'),
    (NEW.id, 'Em estudo', '#8b5cf6'),
    (NEW.id, 'Outros', '#64748b')
  ON CONFLICT (user_id, name) DO NOTHING;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

-- ----- função public.issue_pilot_invite(text, uuid, text, text, text, text) -----
CREATE FUNCTION public.issue_pilot_invite(_pilot_key text, _issuer uuid, _token_hash text, _idempotency_key text, _note text DEFAULT NULL::text, _issued_via text DEFAULT NULL::text) RETURNS TABLE(out_invite_id uuid, out_outcome text, out_remaining integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE _p public.pilots%ROWTYPE; _id uuid; _n integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('pilot-invites:' || _pilot_key));
  SELECT * INTO _p FROM public.pilots WHERE key = _pilot_key FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT NULL::uuid, 'no_pilot'::text, 0; RETURN; END IF;
  IF _issuer IS NULL OR NOT (_p.invite_issuer_user_id = _issuer OR public.has_role(_issuer, 'super_admin')) THEN
    RETURN QUERY SELECT NULL::uuid, 'not_issuer'::text, 0; RETURN;
  END IF;
  SELECT count(*) INTO _n FROM public.access_invites
   WHERE pilot_key = _pilot_key AND (status = 'used' OR (status = 'issued' AND expires_at > now()));
  IF _idempotency_key IS NOT NULL THEN
    SELECT id INTO _id FROM public.access_invites
     WHERE issuer_user_id = _issuer AND idempotency_key = _idempotency_key;
    IF _id IS NOT NULL THEN
      RETURN QUERY SELECT _id, 'replayed'::text, GREATEST(_p.invite_cap - _n, 0); RETURN;
    END IF;
  END IF;
  IF _p.status <> 'go' THEN RETURN QUERY SELECT NULL::uuid, 'not_open'::text, 0; RETURN; END IF;
  IF _n >= _p.invite_cap THEN RETURN QUERY SELECT NULL::uuid, 'cap_reached'::text, 0; RETURN; END IF;
  PERFORM set_config('afonso.pilot_invite_write', 'on', true);
  INSERT INTO public.access_invites (token_hash, issuer_user_id, source, pilot_key, idempotency_key, note, issued_via, expires_at)
  VALUES (_token_hash, _issuer, 'pilot', _pilot_key, _idempotency_key, left(_note, 200), _issued_via,
          now() + make_interval(days => _p.invite_ttl_days))
  RETURNING id INTO _id;
  PERFORM set_config('afonso.pilot_invite_write', 'off', true);
  RETURN QUERY SELECT _id, 'issued'::text, _p.invite_cap - _n - 1;
END $$;
REVOKE ALL ON FUNCTION public.issue_pilot_invite(text, uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_pilot_invite(text, uuid, text, text, text, text) TO service_role;

-- ----- função public.issue_referral_invite(uuid, text, integer, integer) -----
CREATE FUNCTION public.issue_referral_invite(_issuer uuid, _token_hash text, _ttl_days integer, _quota integer) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE _id uuid; _n integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('referral:' || _issuer::text));
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _issuer AND is_beta_tester = true
                 AND (beta_expires_at IS NULL OR beta_expires_at > now())) THEN
    RETURN NULL;
  END IF;
  SELECT count(*) INTO _n FROM public.access_invites
   WHERE issuer_user_id = _issuer AND source = 'beta_tester'
     AND (status = 'used' OR (status = 'issued' AND expires_at > now()));
  IF _n >= _quota THEN RETURN NULL; END IF;
  INSERT INTO public.access_invites (token_hash, issuer_user_id, source, expires_at)
  VALUES (_token_hash, _issuer, 'beta_tester', now() + make_interval(days => _ttl_days))
  RETURNING id INTO _id;
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.issue_referral_invite(uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_referral_invite(uuid, text, integer, integer) TO service_role;

-- ----- função public.mark_pending_presented(uuid, uuid[], text) -----
CREATE FUNCTION public.mark_pending_presented(_user_id uuid, _ids uuid[], _channel text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _n integer;
BEGIN
  UPDATE public.pending_actions
     SET presented_channels = array_append(
           CASE WHEN cardinality(presented_channels) = 0 THEN ARRAY[channel] ELSE presented_channels END,
           _channel)
   WHERE user_id = _user_id
     AND id = ANY(_ids)
     AND NOT (_channel = ANY(
           CASE WHEN cardinality(presented_channels) = 0 THEN ARRAY[channel] ELSE presented_channels END));
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_pending_presented(uuid, uuid[], text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_pending_presented(uuid, uuid[], text) TO service_role;

-- ----- função public.merge_accounts_apply(uuid, uuid) -----
CREATE FUNCTION public.merge_accounts_apply(_source uuid, _target uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
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
$_$;
REVOKE ALL ON FUNCTION public.merge_accounts_apply(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_accounts_apply(uuid, uuid) TO service_role;

-- ----- função public.merge_accounts_preview(uuid) -----
CREATE FUNCTION public.merge_accounts_preview(_source uuid) RETURNS TABLE(table_name text, rows bigint)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
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
$_$;
REVOKE ALL ON FUNCTION public.merge_accounts_preview(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_accounts_preview(uuid) TO service_role;

-- ----- função public.pending_actions_validate() -----
CREATE FUNCTION public.pending_actions_validate() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.status NOT IN (
    'collecting_information','pending_confirmation','executing','executed',
    'correction_pending','corrected','cancelled','failed','expired'
  ) THEN
    RAISE EXCEPTION 'pending_actions.status inválido: %', NEW.status;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.pending_actions_validate() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pending_actions_validate() TO service_role;

-- ----- função public.people_touch_email_norm() -----
CREATE FUNCTION public.people_touch_email_norm() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.email_normalized = CASE WHEN NEW.email IS NULL THEN NULL ELSE lower(btrim(NEW.email)) END;
  RETURN NEW;
END;$$;
REVOKE ALL ON FUNCTION public.people_touch_email_norm() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.people_touch_email_norm() TO service_role;

-- ----- função public.pilot_participant_on_invite_used() -----
CREATE FUNCTION public.pilot_participant_on_invite_used() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.pilot_key IS NOT NULL AND NEW.status = 'used' AND OLD.status IS DISTINCT FROM 'used'
     AND NEW.used_by IS NOT NULL THEN
    INSERT INTO public.pilot_participants (pilot_key, user_id, status, source, invite_id)
    VALUES (NEW.pilot_key, NEW.used_by, 'active', 'invite', NEW.id)
    ON CONFLICT (pilot_key, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.pilot_participant_on_invite_used() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pilot_participant_on_invite_used() TO service_role;

-- ----- função public.pilot_participants_guard() -----
CREATE FUNCTION public.pilot_participants_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.pilot_key IS DISTINCT FROM OLD.pilot_key OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'pilot participant identity is immutable' USING ERRCODE = '42501';
    END IF;
    IF NEW.status = 'active' AND OLD.status <> 'active' THEN
      RAISE EXCEPTION 'pilot seats are granted only by a used pilot invite' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.status = 'active' AND NOT (
       NEW.source = 'invite' AND EXISTS (
         SELECT 1 FROM public.access_invites
          WHERE id = NEW.invite_id AND pilot_key = NEW.pilot_key AND status = 'used' AND used_by = NEW.user_id)) THEN
    RAISE EXCEPTION 'pilot seats are granted only by a used pilot invite' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.pilot_participants_guard() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pilot_participants_guard() TO service_role;

-- ----- função public.plan_configs_validate() -----
CREATE FUNCTION public.plan_configs_validate() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.pricing_mode NOT IN ('paid','invite_only','free_beta','on_request') THEN
    RAISE EXCEPTION 'modo de preco invalido: %', NEW.pricing_mode;
  END IF;
  IF NEW.status = 'published'
     AND NEW.pricing_mode = 'paid'
     AND NEW.price_month IS NULL
     AND NEW.tier <> 'base' THEN
    RAISE EXCEPTION 'Um plano pago nao pode ficar publicado sem preco. Define o preco ou escolhe "apenas por convite", "beta gratuito" ou "preco sob consulta".';
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.plan_configs_validate() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.plan_configs_validate() TO service_role;

-- ----- função public.product_feedback_validate() -----
CREATE FUNCTION public.product_feedback_validate() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.kind NOT IN ('bug','suggestion') THEN
    RAISE EXCEPTION 'tipo de feedback invalido: %', NEW.kind;
  END IF;
  IF NEW.status NOT IN ('novo','em_analise','resolvido','arquivado') THEN
    RAISE EXCEPTION 'estado de feedback invalido: %', NEW.status;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.product_feedback_validate() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.product_feedback_validate() TO service_role;

-- ----- função public.product_updates_validate() -----
CREATE FUNCTION public.product_updates_validate() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.category NOT IN ('nova_funcionalidade','melhoria','correcao') THEN
    RAISE EXCEPTION 'categoria de novidade invalida: %', NEW.category;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.product_updates_validate() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.product_updates_validate() TO service_role;

-- ----- função public.profiles_restrict_self_update() -----
CREATE FUNCTION public.profiles_restrict_self_update() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
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
     OR NEW.billing_last_event_at IS DISTINCT FROM OLD.billing_last_event_at
     OR NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id
     OR NEW.stripe_subscription_id IS DISTINCT FROM OLD.stripe_subscription_id
     OR NEW.stripe_price_id IS DISTINCT FROM OLD.stripe_price_id THEN
    RAISE EXCEPTION 'Não podes alterar campos privilegiados do perfil diretamente.';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.profiles_restrict_self_update() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.profiles_restrict_self_update() TO service_role;

-- ----- função public.profiles_validate_billing() -----
CREATE FUNCTION public.profiles_validate_billing() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.billing_status NOT IN ('none','trialing','active','past_due','canceled') THEN
    RAISE EXCEPTION 'estado de cobranca invalido: %', NEW.billing_status;
  END IF;
  IF NEW.billing_source NOT IN ('manual','stripe') THEN
    RAISE EXCEPTION 'origem de cobranca invalida: %', NEW.billing_source;
  END IF;
  IF NEW.billing_environment NOT IN ('sandbox','live') THEN
    RAISE EXCEPTION 'ambiente de cobranca invalido: %', NEW.billing_environment;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.profiles_validate_billing() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.profiles_validate_billing() TO service_role;

-- ----- função public.purge_admin_audit_logs(integer) -----
CREATE FUNCTION public.purge_admin_audit_logs(_keep_days integer DEFAULT 730) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
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
REVOKE ALL ON FUNCTION public.purge_admin_audit_logs(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_admin_audit_logs(integer) TO service_role;

-- ----- função public.release_conversation_lock(uuid, text, text) -----
CREATE FUNCTION public.release_conversation_lock(_user_id uuid, _channel text, _holder text DEFAULT NULL::text) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  UPDATE public.conversation_locks
     SET locked_until = now() - interval '1 second'
   WHERE user_id = _user_id AND channel = _channel
     AND (_holder IS NULL OR holder = _holder);
$$;
REVOKE ALL ON FUNCTION public.release_conversation_lock(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_conversation_lock(uuid, text, text) TO service_role;

-- ----- função public.release_pending_confirmation(uuid, text, text) -----
CREATE FUNCTION public.release_pending_confirmation(_user_id uuid, _token text, _channel text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _n integer;
BEGIN
  UPDATE public.pending_actions
     SET confirm_token = NULL,
         confirm_token_at = NULL,
         resolved_channel = CASE
           WHEN status IN ('executed','cancelled','corrected','failed')
             THEN coalesce(resolved_channel, _channel)
           ELSE resolved_channel
         END
   WHERE user_id = _user_id
     AND confirm_token = _token;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$$;
REVOKE ALL ON FUNCTION public.release_pending_confirmation(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_pending_confirmation(uuid, text, text) TO service_role;

-- ----- função public.release_unsolicited_slot(uuid, date, text) -----
CREATE FUNCTION public.release_unsolicited_slot(_user_id uuid, _day date, _ref_key text) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  DELETE FROM public.proactive_daily_ledger
   WHERE user_id = _user_id AND day = _day AND ref_key = _ref_key;
$$;
REVOKE ALL ON FUNCTION public.release_unsolicited_slot(uuid, date, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_unsolicited_slot(uuid, date, text) TO service_role;

-- ----- função public.reminders_sync_follow_up_id() -----
CREATE FUNCTION public.reminders_sync_follow_up_id() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.related_resource_type = 'follow_up' AND NEW.related_resource_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.follow_ups f WHERE f.id = NEW.related_resource_id) THEN
      NEW.follow_up_id := NEW.related_resource_id;
    ELSE
      NEW.follow_up_id := NULL;
    END IF;
  ELSE
    NEW.follow_up_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.reminders_sync_follow_up_id() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reminders_sync_follow_up_id() TO service_role;

-- ----- função public.reserve_unsolicited_slot(uuid, date, text, text, integer) -----
CREATE FUNCTION public.reserve_unsolicited_slot(_user_id uuid, _day date, _source text, _ref_key text, _cap integer DEFAULT 1) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _n integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(_user_id::text || ':' || _day::text, 0));
  IF EXISTS (SELECT 1 FROM public.proactive_daily_ledger
              WHERE user_id = _user_id AND day = _day AND ref_key = _ref_key) THEN
    RETURN true; -- mesma intervenção (retry): idempotente
  END IF;
  SELECT count(*) INTO _n FROM public.proactive_daily_ledger
   WHERE user_id = _user_id AND day = _day;
  IF _n >= greatest(coalesce(_cap, 1), 0) THEN
    RETURN false;
  END IF;
  INSERT INTO public.proactive_daily_ledger (user_id, day, source, ref_key)
  VALUES (_user_id, _day, _source, _ref_key);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_unsolicited_slot(uuid, date, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_unsolicited_slot(uuid, date, text, text, integer) TO service_role;

-- ----- função public.revoke_pilot_invite(text, uuid, uuid, text) -----
CREATE FUNCTION public.revoke_pilot_invite(_pilot_key text, _actor uuid, _invite_id uuid, _token_hash text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE _inv public.access_invites%ROWTYPE; _designated uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('pilot-invites:' || _pilot_key));
  SELECT invite_issuer_user_id INTO _designated FROM public.pilots WHERE key = _pilot_key;
  SELECT * INTO _inv FROM public.access_invites
   WHERE pilot_key = _pilot_key
     AND ((_invite_id IS NOT NULL AND id = _invite_id) OR (_token_hash IS NOT NULL AND token_hash = _token_hash))
   FOR UPDATE;
  IF NOT FOUND OR _actor IS NULL THEN RETURN 'not_found'; END IF;
  IF NOT (_inv.issuer_user_id = _actor OR _designated = _actor OR public.has_role(_actor, 'super_admin')) THEN
    RETURN 'not_found';
  END IF;
  IF _inv.status <> 'issued' THEN RETURN 'not_found'; END IF;
  PERFORM set_config('afonso.pilot_invite_write', 'on', true);
  UPDATE public.access_invites SET status = 'revoked', revoked_at = now(), revoked_by = _actor WHERE id = _inv.id;
  PERFORM set_config('afonso.pilot_invite_write', 'off', true);
  RETURN 'revoked';
END $$;
REVOKE ALL ON FUNCTION public.revoke_pilot_invite(text, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_pilot_invite(text, uuid, uuid, text) TO service_role;

-- ----- função public.set_updated_at() -----
CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO service_role;

-- ----- função public.subscription_events_validate() -----
CREATE FUNCTION public.subscription_events_validate() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.event NOT IN (
    'trial_started','trial_to_consultor','trial_to_pro','trial_to_base',
    'base_to_paid','paid_to_base','churn','reactivation'
  ) THEN
    RAISE EXCEPTION 'evento de subscricao invalido: %', NEW.event;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.subscription_events_validate() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.subscription_events_validate() TO service_role;

-- ----- função public.tier_at_least(uuid, text) -----
CREATE FUNCTION public.tier_at_least(_user_id uuid, _min text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    CASE public.effective_tier(_user_id)
      WHEN 'base' THEN 0 WHEN 'consultor' THEN 1 WHEN 'pro' THEN 2 WHEN 'hub' THEN 3
      ELSE -1
    END
    >=
    CASE _min
      WHEN 'base' THEN 0 WHEN 'consultor' THEN 1 WHEN 'pro' THEN 2 WHEN 'hub' THEN 3
      ELSE 99
    END
$$;
REVOKE ALL ON FUNCTION public.tier_at_least(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tier_at_least(uuid, text) TO service_role;

-- ----- função public.try_acquire_conversation_lock(uuid, text, integer, text) -----
CREATE FUNCTION public.try_acquire_conversation_lock(_user_id uuid, _channel text, _ttl_seconds integer DEFAULT 60, _holder text DEFAULT NULL::text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _got boolean := false;
BEGIN
  INSERT INTO public.conversation_locks (user_id, channel, locked_until, holder)
  VALUES (_user_id, _channel, now() + make_interval(secs => _ttl_seconds), _holder)
  ON CONFLICT (user_id, channel) DO UPDATE
    SET locked_until = now() + make_interval(secs => _ttl_seconds),
        holder = _holder
    WHERE public.conversation_locks.locked_until < now()
  RETURNING true INTO _got;
  RETURN coalesce(_got, false);
END;
$$;
REVOKE ALL ON FUNCTION public.try_acquire_conversation_lock(uuid, text, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.try_acquire_conversation_lock(uuid, text, integer, text) TO service_role;
