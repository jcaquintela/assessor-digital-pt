--
-- PostgreSQL database dump
--

\restrict xXQyj2X5J2bpFmw6l2rn76oiqHz35eML2NCP0VJywtctoMgmR78Dmsqnn842IuM

-- Dumped from database version 17.11
-- Dumped by pg_dump version 17.11

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'admin',
    'tester',
    'consultant',
    'support_admin',
    'super_admin'
);


--
-- Name: assistant_correction_category; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.assistant_correction_category AS ENUM (
    'wrong_person',
    'wrong_property',
    'wrong_date',
    'wrong_document',
    'lost_context',
    'unnatural_reply',
    'unnecessary_question',
    'wrong_execution',
    'other'
);


--
-- Name: assistant_reflection_trigger; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.assistant_reflection_trigger AS ENUM (
    'low_aqs',
    'low_ats',
    'user_correction'
);


--
-- Name: deal_stage; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.deal_stage AS ENUM (
    'preparacao',
    'angariacao',
    'promocao',
    'visitas',
    'proposta',
    'cpcv',
    'escritura',
    'concluido',
    'perdido'
);


--
-- Name: person_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.person_role AS ENUM (
    'owner',
    'potential_owner',
    'buyer',
    'potential_buyer',
    'client',
    'reference',
    'partner',
    'supplier',
    'colleague',
    'other'
);


--
-- Name: prospecting_listing_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.prospecting_listing_type AS ENUM (
    'owner_sale',
    'other_agency',
    'own_agency',
    'unknown'
);


--
-- Name: prospecting_source_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.prospecting_source_type AS ENUM (
    'street_sign',
    'referral',
    'online_listing',
    'direct_observation',
    'other'
);


--
-- Name: prospecting_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.prospecting_status AS ENUM (
    'to_contact',
    'contact_attempted',
    'contacted',
    'no_interest',
    'opportunity',
    'converted',
    'archived'
);


--
-- Name: access_invites_pilot_guard(); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: account_access_on_new_profile(); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: audit_sensitive_write(); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: claim_inbound_message(text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: claim_pending_confirmation(uuid, uuid[], text, integer); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: consultant_preferences_track_opt_ins(); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: consume_access_invite(text, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: content_access_consents_validate(); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: conversation_states_touch(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.conversation_states_touch() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: daily_digests_validate(); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: effective_tier(uuid); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: email_drafts_validate(); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: expire_beta_testers(); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: has_role(uuid, public.app_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
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
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  );
END;
$$;


--
-- Name: has_staging_access(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_staging_access(_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','tester'))
$$;


--
-- Name: is_admin(uuid); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: issue_pilot_invite(text, uuid, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: issue_referral_invite(uuid, text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: mark_pending_presented(uuid, uuid[], text); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: merge_accounts_apply(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: merge_accounts_preview(uuid); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: pending_actions_validate(); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: people_touch_email_norm(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.people_touch_email_norm() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.email_normalized = CASE WHEN NEW.email IS NULL THEN NULL ELSE lower(btrim(NEW.email)) END;
  RETURN NEW;
END;$$;


--
-- Name: pilot_participant_on_invite_used(); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: pilot_participants_guard(); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: plan_configs_validate(); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: product_feedback_validate(); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: product_updates_validate(); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: profiles_restrict_self_update(); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: profiles_validate_billing(); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: purge_admin_audit_logs(integer); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: release_conversation_lock(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.release_conversation_lock(_user_id uuid, _channel text, _holder text DEFAULT NULL::text) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  UPDATE public.conversation_locks
     SET locked_until = now() - interval '1 second'
   WHERE user_id = _user_id AND channel = _channel
     AND (_holder IS NULL OR holder = _holder);
$$;


--
-- Name: release_pending_confirmation(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: release_unsolicited_slot(uuid, date, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.release_unsolicited_slot(_user_id uuid, _day date, _ref_key text) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  DELETE FROM public.proactive_daily_ledger
   WHERE user_id = _user_id AND day = _day AND ref_key = _ref_key;
$$;


--
-- Name: reminders_sync_follow_up_id(); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: reserve_unsolicited_slot(uuid, date, text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: revoke_pilot_invite(text, uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;


--
-- Name: subscription_events_validate(); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: text_norm(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.text_norm(_t text) RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    SET search_path TO 'public', 'extensions'
    AS $$ select lower(extensions.unaccent('extensions.unaccent', coalesce(_t, ''))) $$;


--
-- Name: tier_at_least(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: try_acquire_conversation_lock(uuid, text, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

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


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: access_invite_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.access_invite_attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    channel text,
    ok boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: access_invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.access_invites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    token_hash text NOT NULL,
    issuer_user_id uuid,
    source text NOT NULL,
    status text DEFAULT 'issued'::text NOT NULL,
    note text,
    expires_at timestamp with time zone NOT NULL,
    used_by uuid,
    used_at timestamp with time zone,
    used_channel text,
    revoked_at timestamp with time zone,
    revoked_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    pilot_key text,
    idempotency_key text,
    issued_via text,
    CONSTRAINT access_invites_pilot_chk CHECK (((source = 'pilot'::text) = (pilot_key IS NOT NULL))),
    CONSTRAINT access_invites_source_chk CHECK ((source = ANY (ARRAY['beta_tester'::text, 'admin'::text, 'pilot'::text]))),
    CONSTRAINT access_invites_status_chk CHECK ((status = ANY (ARRAY['issued'::text, 'used'::text, 'revoked'::text])))
);


--
-- Name: access_waitlist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.access_waitlist (
    user_id uuid NOT NULL,
    channel text,
    consent_contact boolean DEFAULT false NOT NULL,
    consent_at timestamp with time zone,
    notify boolean DEFAULT true NOT NULL,
    status text DEFAULT 'waiting'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT access_waitlist_status_chk CHECK ((status = ANY (ARRAY['waiting'::text, 'granted'::text, 'removed'::text])))
);


--
-- Name: account_access; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.account_access (
    user_id uuid NOT NULL,
    state text DEFAULT 'registered_waiting'::text NOT NULL,
    invite_id uuid,
    source text,
    activated_at timestamp with time zone,
    trial_started_at timestamp with time zone,
    waitlist_offered_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT account_access_state_chk CHECK ((state = ANY (ARRAY['registered_waiting'::text, 'invited'::text, 'activated'::text, 'trialing'::text, 'subscribed'::text])))
);


--
-- Name: admin_audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    admin_user_id uuid,
    action text NOT NULL,
    target_user_id uuid,
    resource_type text,
    resource_id text,
    reason text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: admin_broadcast_recipients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_broadcast_recipients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    broadcast_id uuid NOT NULL,
    user_id uuid,
    email text,
    status text DEFAULT 'pendente'::text NOT NULL,
    error text,
    attempted_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: admin_broadcasts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_broadcasts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    channel text NOT NULL,
    segment text DEFAULT 'all'::text NOT NULL,
    subject text,
    body text NOT NULL,
    recipients_count integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'sent'::text NOT NULL,
    error text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: admin_cost_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_cost_settings (
    key text NOT NULL,
    value numeric,
    source text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE admin_cost_settings; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.admin_cost_settings IS 'Infraestrutura interna: acesso exclusivo do servidor (service_role).';


--
-- Name: admin_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    consultor_id uuid NOT NULL,
    admin_id uuid NOT NULL,
    pergunta text NOT NULL,
    enviado_em timestamp with time zone DEFAULT now() NOT NULL,
    resposta text,
    respondido_em timestamp with time zone,
    estado text DEFAULT 'pendente'::text NOT NULL,
    janela_expira_em timestamp with time zone DEFAULT (now() + '48:00:00'::interval) NOT NULL,
    resposta_lida_em timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE admin_messages; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.admin_messages IS 'Infraestrutura interna: acesso exclusivo do servidor (service_role). Sem grants para anon/authenticated por desenho.';


--
-- Name: admin_mfa_required; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_mfa_required (
    user_id uuid NOT NULL,
    required_at timestamp with time zone DEFAULT now() NOT NULL,
    required_by uuid
);


--
-- Name: ai_model_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_model_rates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    model text NOT NULL,
    credits_per_1m_input numeric NOT NULL,
    credits_per_1m_output numeric NOT NULL,
    source text,
    effective_from date DEFAULT CURRENT_DATE NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE ai_model_rates; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.ai_model_rates IS 'Infraestrutura interna: acesso exclusivo do servidor (service_role).';


--
-- Name: alert_mutes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alert_mutes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    alert_key text NOT NULL,
    muted_until timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: announcement_dismissals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.announcement_dismissals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    announcement_id uuid NOT NULL,
    dismissed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: app_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_settings (
    key text NOT NULL,
    value_int integer,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: app_user_connection_aliases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_user_connection_aliases (
    user_id uuid NOT NULL,
    connector_id text NOT NULL,
    app_user_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE app_user_connection_aliases; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.app_user_connection_aliases IS 'Infraestrutura interna: acesso exclusivo do servidor (service_role).';


--
-- Name: app_user_connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_user_connections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    connector_id text NOT NULL,
    connection_key_ciphertext text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE app_user_connections; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.app_user_connections IS 'Segredos de ligacoes externas (tokens cifrados): acesso exclusivo do servidor (service_role).';


--
-- Name: assessor_ai_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assessor_ai_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid,
    channel text NOT NULL,
    model text NOT NULL,
    intent text,
    confidence numeric,
    input_tokens integer,
    output_tokens integer,
    total_tokens integer,
    latency_ms integer,
    success boolean DEFAULT true NOT NULL,
    error text,
    estimated_cost_usd numeric,
    domain text,
    route text,
    fallback_used boolean DEFAULT false,
    tool_name text,
    tool_success boolean,
    modality text,
    billed_model text
);


--
-- Name: assessor_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assessor_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    role text NOT NULL,
    content text NOT NULL,
    message_type text,
    structured_payload jsonb,
    status text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    channel text DEFAULT 'app'::text NOT NULL,
    sender_phone text,
    whatsapp_message_id text,
    conversation_id text,
    related_pending_action_id uuid,
    related_resource_type text,
    related_resource_id uuid,
    archived_at timestamp with time zone
);

ALTER TABLE ONLY public.assessor_messages REPLICA IDENTITY FULL;

ALTER TABLE ONLY public.assessor_messages FORCE ROW LEVEL SECURITY;


--
-- Name: assessor_nudges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assessor_nudges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    kind text NOT NULL,
    subject_type text,
    subject_id uuid,
    reason text NOT NULL,
    suggested_reply text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    scheduled_for timestamp with time zone DEFAULT now() NOT NULL,
    sent_at timestamp with time zone,
    dedupe_key text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    outcome text,
    outcome_at timestamp with time zone,
    urgency text DEFAULT 'useful'::text NOT NULL,
    priority integer,
    evidence jsonb
);


--
-- Name: assessor_quality_scores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assessor_quality_scores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    channel text NOT NULL,
    trace_id uuid,
    understood_first_try boolean,
    reformulated boolean,
    executed_successfully boolean,
    human_tone boolean,
    score numeric(4,3),
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: assessor_reasoning_traces; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assessor_reasoning_traces (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid NOT NULL,
    channel text NOT NULL,
    source_message_id text,
    input_content text NOT NULL,
    observations jsonb DEFAULT '[]'::jsonb NOT NULL,
    hypotheses jsonb DEFAULT '[]'::jsonb NOT NULL,
    searches jsonb DEFAULT '{}'::jsonb NOT NULL,
    decision jsonb DEFAULT '{}'::jsonb NOT NULL,
    tool_calls jsonb DEFAULT '[]'::jsonb NOT NULL,
    memory_writes jsonb DEFAULT '[]'::jsonb NOT NULL,
    reply text,
    think_latency_ms integer,
    decide_latency_ms integer,
    total_latency_ms integer,
    input_tokens integer,
    output_tokens integer,
    success boolean DEFAULT true NOT NULL,
    error text
);


--
-- Name: assessor_tool_calls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assessor_tool_calls (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    channel text NOT NULL,
    turn_id uuid,
    tool_name text NOT NULL,
    arguments jsonb DEFAULT '{}'::jsonb NOT NULL,
    result jsonb,
    success boolean NOT NULL,
    error text,
    latency_ms integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: assistant_golden_conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assistant_golden_conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    title text NOT NULL,
    description text,
    turns jsonb DEFAULT '[]'::jsonb NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: assistant_golden_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assistant_golden_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    golden_id uuid NOT NULL,
    release_ref text NOT NULL,
    passed boolean NOT NULL,
    ats numeric,
    aqs numeric,
    task_success numeric,
    diffs jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: assistant_reflections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assistant_reflections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    trace_id uuid,
    correction_id uuid,
    trigger public.assistant_reflection_trigger NOT NULL,
    analysis jsonb DEFAULT '{}'::jsonb NOT NULL,
    model text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: assistant_shadow_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assistant_shadow_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    channel text NOT NULL,
    trace_id uuid,
    strategy text NOT NULL,
    reply text,
    ats numeric,
    aqs numeric,
    task_success numeric,
    latency_ms integer,
    diff jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: assistant_trust_scores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assistant_trust_scores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    channel text NOT NULL,
    trace_id uuid,
    task_success numeric,
    aqs_score numeric,
    corrections_count integer DEFAULT 0 NOT NULL,
    context_preservation numeric,
    safe_decisions numeric,
    ats numeric,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: assistant_user_corrections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assistant_user_corrections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    channel text NOT NULL,
    conversation_id text,
    turn_id uuid,
    category public.assistant_correction_category DEFAULT 'other'::public.assistant_correction_category NOT NULL,
    original_message text,
    correction_message text NOT NULL,
    final_result text,
    resolved boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: autonomy_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.autonomy_rules (
    user_id uuid NOT NULL,
    action_type text NOT NULL,
    requires_confirmation boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: billing_test_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_test_accounts (
    user_id uuid NOT NULL,
    added_by uuid,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: calendar_connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_connections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    provider text NOT NULL,
    external_account_id text,
    display_name text,
    scopes text[] DEFAULT ARRAY[]::text[] NOT NULL,
    refresh_token_encrypted text,
    is_primary boolean DEFAULT false NOT NULL,
    connected_at timestamp with time zone DEFAULT now() NOT NULL,
    last_sync_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: calendar_event_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_event_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    provider text NOT NULL,
    follow_up_id uuid NOT NULL,
    external_event_id text NOT NULL,
    external_calendar_id text,
    external_updated_at timestamp with time zone,
    local_updated_at timestamp with time zone,
    last_synced_at timestamp with time zone DEFAULT now() NOT NULL,
    last_origin text,
    deleted boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    series_master_id text,
    recurrence_type text,
    CONSTRAINT calendar_event_links_provider_check CHECK ((provider = ANY (ARRAY['google_calendar'::text, 'microsoft_outlook'::text])))
);


--
-- Name: calendar_sync_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_sync_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    provider text NOT NULL,
    follow_up_id uuid,
    external_event_id text,
    direction text NOT NULL,
    action text NOT NULL,
    origin text NOT NULL,
    detail text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: calendar_sync_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_sync_state (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    provider text NOT NULL,
    calendar_id text,
    sync_token text,
    delta_link text,
    last_polled_at timestamp with time zone,
    last_error text,
    enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT calendar_sync_state_provider_check CHECK ((provider = ANY (ARRAY['google_calendar'::text, 'microsoft_outlook'::text])))
);


--
-- Name: channel_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.channel_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    channel text NOT NULL,
    external_id text NOT NULL,
    display_name text,
    linked_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT channel_links_channel_check CHECK ((channel = ANY (ARRAY['whatsapp'::text, 'telegram'::text])))
);


--
-- Name: consultant_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.consultant_preferences (
    user_id uuid NOT NULL,
    morning_briefing_enabled boolean DEFAULT true NOT NULL,
    morning_time time without time zone DEFAULT '08:00:00'::time without time zone NOT NULL,
    morning_days integer[] DEFAULT ARRAY[1, 2, 3, 4, 5] NOT NULL,
    evening_wrap_enabled boolean DEFAULT true NOT NULL,
    evening_time time without time zone DEFAULT '19:00:00'::time without time zone NOT NULL,
    quiet_hours_start time without time zone DEFAULT '22:00:00'::time without time zone NOT NULL,
    quiet_hours_end time without time zone DEFAULT '07:30:00'::time without time zone NOT NULL,
    timezone text DEFAULT 'Europe/Lisbon'::text NOT NULL,
    primary_channel text DEFAULT 'whatsapp'::text NOT NULL,
    max_daily_nudges integer DEFAULT 6 NOT NULL,
    autonomy_level text DEFAULT 'balanced'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    proactive_push_enabled boolean DEFAULT false NOT NULL,
    evening_checkin_enabled boolean DEFAULT true NOT NULL,
    evening_checkin_time time without time zone DEFAULT '18:00:00'::time without time zone NOT NULL,
    confirm_document_send boolean DEFAULT false NOT NULL,
    reminder_lead_minutes integer,
    active_calendar_provider text,
    active_mail_provider text,
    evening_review_detail text DEFAULT 'normal'::text NOT NULL,
    max_unsolicited_nudges_per_day integer DEFAULT 1 NOT NULL,
    explicit_opt_ins text[] DEFAULT '{}'::text[] NOT NULL,
    CONSTRAINT consultant_preferences_active_calendar_provider_check CHECK (((active_calendar_provider IS NULL) OR (active_calendar_provider = ANY (ARRAY['google_calendar'::text, 'microsoft_outlook'::text])))),
    CONSTRAINT consultant_preferences_active_mail_provider_check CHECK (((active_mail_provider IS NULL) OR (active_mail_provider = ANY (ARRAY['gmail'::text, 'outlook'::text])))),
    CONSTRAINT consultant_preferences_evening_review_detail_check CHECK ((evening_review_detail = ANY (ARRAY['curto'::text, 'normal'::text, 'detalhado'::text]))),
    CONSTRAINT consultant_preferences_max_unsolicited_check CHECK (((max_unsolicited_nudges_per_day >= 0) AND (max_unsolicited_nudges_per_day <= 20))),
    CONSTRAINT consultant_preferences_reminder_lead_minutes_check CHECK (((reminder_lead_minutes IS NULL) OR ((reminder_lead_minutes >= 0) AND (reminder_lead_minutes <= 240))))
);


--
-- Name: COLUMN consultant_preferences.explicit_opt_ins; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.consultant_preferences.explicit_opt_ins IS 'Notificações que o consultor ligou explicitamente (morning_briefing, evening_review, push). Ligado por defeito não conta.';


--
-- Name: content_access_consents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.content_access_consents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    requested_by uuid NOT NULL,
    scope text DEFAULT 'conversation'::text NOT NULL,
    resource_id text,
    reason text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    expires_at timestamp with time zone,
    decided_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: conversation_locks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_locks (
    user_id uuid NOT NULL,
    channel text NOT NULL,
    locked_until timestamp with time zone NOT NULL,
    holder text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: conversation_states; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_states (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    channel text NOT NULL,
    external_conversation_id text DEFAULT 'default'::text NOT NULL,
    active_topic text,
    state_summary text,
    last_intent text,
    last_entity_type text,
    last_entity_id uuid,
    pending_action_id uuid,
    last_created_resource_type text,
    last_created_resource_id uuid,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_property_id uuid,
    goal text,
    factual_summary text,
    active_person_id uuid,
    sparring_turns integer DEFAULT 0 NOT NULL,
    last_read_tool text,
    last_read_args jsonb,
    last_read_axis text,
    last_read_at timestamp with time zone,
    last_channel text,
    CONSTRAINT conversation_states_last_read_axis_check CHECK (((last_read_axis IS NULL) OR (last_read_axis = ANY (ARRAY['time'::text, 'none'::text]))))
);


--
-- Name: COLUMN conversation_states.last_channel; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.conversation_states.last_channel IS 'Canal da última escrita no estado partilhado da conta (linha channel=account).';


--
-- Name: daily_digests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_digests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    digest_date date NOT NULL,
    subject text DEFAULT ''::text NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'rascunho'::text NOT NULL,
    approved_by uuid,
    approved_at timestamp with time zone,
    sent_at timestamp with time zone,
    recipients_count integer DEFAULT 0 NOT NULL,
    broadcast_id uuid,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    body_edited boolean DEFAULT false NOT NULL
);


--
-- Name: daily_priorities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_priorities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    subject_type text NOT NULL,
    subject_id uuid,
    action text NOT NULL,
    reasons text[] DEFAULT ARRAY[]::text[] NOT NULL,
    priority_score numeric DEFAULT 0 NOT NULL,
    due_at timestamp with time zone,
    calculated_at timestamp with time zone DEFAULT now() NOT NULL,
    dismissed_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: dashboard_announcements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dashboard_announcements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    segment text DEFAULT 'all'::text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    expires_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: dashboard_login_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dashboard_login_tokens (
    token text NOT NULL,
    user_id uuid NOT NULL,
    channel text DEFAULT 'telegram'::text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    reason text,
    issued_by uuid
);


--
-- Name: TABLE dashboard_login_tokens; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.dashboard_login_tokens IS 'Hashes de tokens de login/recuperacao: acesso exclusivo do servidor (service_role).';


--
-- Name: deal_deadlines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deal_deadlines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    opportunity_id uuid NOT NULL,
    label text NOT NULL,
    due_date date NOT NULL,
    status text DEFAULT 'aberto'::text NOT NULL,
    notes text,
    notice_days integer,
    archived_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT deal_deadlines_status_check CHECK ((status = ANY (ARRAY['aberto'::text, 'cumprido'::text, 'cancelado'::text])))
);


--
-- Name: email_connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_connections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    provider text DEFAULT 'gmail'::text NOT NULL,
    email_address text,
    connected_at timestamp with time zone DEFAULT now() NOT NULL,
    last_ok_at timestamp with time zone,
    expires_at timestamp with time zone,
    reauth_warned_at timestamp with time zone,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: email_drafts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_drafts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    thread_id uuid,
    provider_draft_id text,
    to_emails text[] DEFAULT '{}'::text[] NOT NULL,
    subject text,
    body text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    confirmed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    provider text DEFAULT 'gmail'::text NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '06:00:00'::interval) NOT NULL,
    sent_at timestamp with time zone,
    sent_body text,
    in_reply_to_message_id text,
    revisions integer DEFAULT 0 NOT NULL,
    confirmation_text text,
    channel text DEFAULT 'dashboard'::text NOT NULL,
    to_name text,
    person_id uuid,
    archived_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    cancel_reason text,
    kind text DEFAULT 'reply'::text NOT NULL
);


--
-- Name: email_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    thread_id uuid NOT NULL,
    provider_message_id text NOT NULL,
    from_email text,
    from_name text,
    to_emails text[] DEFAULT '{}'::text[] NOT NULL,
    sent_at timestamp with time zone,
    snippet text,
    direction text DEFAULT 'inbound'::text NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    provider text DEFAULT 'gmail'::text NOT NULL
);


--
-- Name: email_threads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_threads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    provider text DEFAULT 'gmail'::text NOT NULL,
    provider_thread_id text NOT NULL,
    subject text,
    last_message_at timestamp with time zone,
    person_id uuid,
    summary text,
    summarized_at timestamp with time zone,
    archived_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: entity_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entity_tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    tag_id uuid NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: event_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    color text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: feature_flag_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feature_flag_users (
    flag_key text NOT NULL,
    user_id uuid NOT NULL
);


--
-- Name: feature_flags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feature_flags (
    key text NOT NULL,
    description text,
    enabled_globally boolean DEFAULT false NOT NULL,
    enabled_plans text[] DEFAULT '{}'::text[] NOT NULL,
    rollout_percentage integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    CONSTRAINT feature_flags_rollout_percentage_check CHECK (((rollout_percentage >= 0) AND (rollout_percentage <= 100)))
);


--
-- Name: file_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.file_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    color text
);


--
-- Name: file_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.file_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    file_id uuid NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    relation_type text DEFAULT 'belongs_to'::text NOT NULL,
    source text DEFAULT 'user'::text NOT NULL,
    confidence numeric,
    confirmed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT file_links_entity_type_check CHECK ((entity_type = ANY (ARRAY['person'::text, 'property'::text, 'opportunity'::text, 'follow_up'::text, 'interaction'::text, 'miscellaneous'::text, 'prospecting_lead'::text]))),
    CONSTRAINT file_links_relation_type_check CHECK ((relation_type = ANY (ARRAY['belongs_to'::text, 'supports'::text, 'received_from'::text, 'related_to'::text, 'version_of'::text, 'evidence_for'::text, 'attachment'::text]))),
    CONSTRAINT file_links_source_check CHECK ((source = ANY (ARRAY['ai'::text, 'user'::text, 'rule'::text, 'migration'::text])))
);


--
-- Name: financial_movements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financial_movements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    opportunity_id uuid,
    property_id uuid,
    type text NOT NULL,
    description text NOT NULL,
    category text,
    amount numeric(12,2) DEFAULT 0 NOT NULL,
    vat_amount numeric(12,2),
    status text DEFAULT 'Prevista'::text NOT NULL,
    movement_date timestamp with time zone DEFAULT now() NOT NULL,
    expected_payment_date timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    archived_at timestamp with time zone
);

ALTER TABLE ONLY public.financial_movements FORCE ROW LEVEL SECURITY;


--
-- Name: folder_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.folder_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    folder_id uuid NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: folders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.folders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    color text
);


--
-- Name: follow_ups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.follow_ups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    person_id uuid,
    opportunity_id uuid,
    type text DEFAULT 'task'::text NOT NULL,
    title text NOT NULL,
    due_date timestamp with time zone DEFAULT now() NOT NULL,
    due_time text,
    status text DEFAULT 'Pendente'::text NOT NULL,
    priority text DEFAULT 'Média'::text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    related_file_id uuid,
    related_property_id uuid,
    source_channel text,
    source_message_id text,
    source_pending_action_id uuid,
    timezone text,
    external_reference text,
    created_by_assessor boolean DEFAULT false NOT NULL,
    outcome text,
    outcome_notes text,
    outcome_recorded_at timestamp with time zone,
    next_action_created_id uuid,
    related_prospecting_lead_id uuid,
    briefing_sent_at timestamp with time zone,
    objection_guide_sent_at timestamp with time zone,
    archived_at timestamp with time zone,
    title_norm text GENERATED ALWAYS AS (public.text_norm(title)) STORED,
    event_class text,
    event_category text,
    event_category_id uuid,
    duration_minutes integer,
    CONSTRAINT follow_ups_event_class_chk CHECK (((event_class IS NULL) OR (event_class = ANY (ARRAY['negocio'::text, 'interno'::text]))))
);

ALTER TABLE ONLY public.follow_ups FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN follow_ups.duration_minutes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.follow_ups.duration_minutes IS 'Duração real do compromisso em minutos (vinda do calendário externo). NULL = desconhecida, assume-se 60.';


--
-- Name: inbound_message_claims; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inbound_message_claims (
    channel text NOT NULL,
    external_message_id text NOT NULL,
    claimed_at timestamp with time zone DEFAULT now() NOT NULL,
    attempts integer DEFAULT 1 NOT NULL
);


--
-- Name: interactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.interactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    person_id uuid,
    opportunity_id uuid,
    source_channel text DEFAULT 'web'::text NOT NULL,
    original_content text,
    summary text,
    interaction_type text,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    property_id uuid,
    is_confidential boolean DEFAULT false NOT NULL,
    archived_at timestamp with time zone
);

ALTER TABLE ONLY public.interactions FORCE ROW LEVEL SECURITY;


--
-- Name: invite_send_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invite_send_attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    canal text DEFAULT 'whatsapp'::text NOT NULL,
    status text DEFAULT 'pendente'::text NOT NULL,
    reason text,
    error_code integer,
    destino text,
    attempts integer DEFAULT 1 NOT NULL,
    last_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
    sent_at timestamp with time zone,
    requested_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: landing_page_visits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.landing_page_visits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    visit_date date DEFAULT ((now() AT TIME ZONE 'Europe/Lisbon'::text))::date NOT NULL,
    visit_hour smallint DEFAULT EXTRACT(hour FROM (now() AT TIME ZONE 'Europe/Lisbon'::text)) NOT NULL,
    referrer_host text,
    path text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: mentor_decisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mentor_decisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    tip_key text NOT NULL,
    decision text NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT mentor_decisions_decision_check CHECK ((decision = ANY (ARRAY['confirmar'::text, 'editar'::text, 'cancelar'::text, 'tratado'::text])))
);


--
-- Name: miscellaneous_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.miscellaneous_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    original_content text,
    summary text,
    category text,
    source_channel text DEFAULT 'web'::text NOT NULL,
    source_message_id uuid,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'inbox'::text NOT NULL,
    tags text[] DEFAULT ARRAY[]::text[] NOT NULL,
    related_person_id uuid,
    related_property_id uuid,
    related_opportunity_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_confidential boolean DEFAULT false NOT NULL,
    archived_at timestamp with time zone,
    title_norm text GENERATED ALWAYS AS (public.text_norm(title)) STORED,
    team_read_at timestamp with time zone,
    team_archived_at timestamp with time zone,
    item_class text DEFAULT 'genuino'::text NOT NULL,
    CONSTRAINT miscellaneous_items_item_class_check CHECK ((item_class = ANY (ARRAY['genuino'::text, 'falha_interpretacao'::text]))),
    CONSTRAINT miscellaneous_items_status_check CHECK ((status = ANY (ARRAY['inbox'::text, 'reviewed'::text, 'classified'::text, 'archived'::text, 'deleted'::text])))
);


--
-- Name: opportunities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.opportunities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    person_id uuid,
    property_id uuid,
    type text DEFAULT 'Compra'::text NOT NULL,
    status text DEFAULT 'Novo'::text NOT NULL,
    value numeric(12,2) DEFAULT 0,
    probability text DEFAULT 'Média'::text NOT NULL,
    next_action text,
    next_action_date timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    title text,
    deal_kind text DEFAULT 'comprador'::text NOT NULL,
    stage public.deal_stage DEFAULT 'preparacao'::public.deal_stage NOT NULL,
    stage_changed_at timestamp with time zone DEFAULT now() NOT NULL,
    deadline timestamp with time zone,
    archived_at timestamp with time zone,
    title_norm text GENERATED ALWAYS AS (public.text_norm(title)) STORED,
    source_lead_id uuid,
    CONSTRAINT opportunities_deal_kind_check CHECK ((deal_kind = ANY (ARRAY['comprador'::text, 'vendedor'::text])))
);

ALTER TABLE ONLY public.opportunities FORCE ROW LEVEL SECURITY;


--
-- Name: opportunity_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.opportunity_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    opportunity_id uuid NOT NULL,
    kind text NOT NULL,
    summary text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    source text DEFAULT 'dashboard'::text NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: opportunity_properties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.opportunity_properties (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    opportunity_id uuid NOT NULL,
    property_id uuid NOT NULL,
    role text DEFAULT 'principal'::text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pending_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pending_actions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    channel text NOT NULL,
    source_message_id uuid,
    intent text NOT NULL,
    original_content text NOT NULL,
    structured_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    missing_fields text[] DEFAULT ARRAY[]::text[] NOT NULL,
    status text DEFAULT 'pending_confirmation'::text NOT NULL,
    confidence numeric,
    pending_question text,
    created_resource_type text,
    created_resource_id uuid,
    error_message text,
    expires_at timestamp with time zone DEFAULT (now() + '24:00:00'::interval) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    current_question text,
    confirmed_fields jsonb DEFAULT '{}'::jsonb NOT NULL,
    goal text,
    presented_channels text[] DEFAULT '{}'::text[] NOT NULL,
    confirm_token text,
    confirm_token_at timestamp with time zone,
    resolved_channel text
);


--
-- Name: COLUMN pending_actions.presented_channels; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pending_actions.presented_channels IS 'Canais onde a pergunta deste pendente foi mostrada ao consultor. Vazio = só o canal de origem (coluna channel).';


--
-- Name: COLUMN pending_actions.confirm_token; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pending_actions.confirm_token IS 'Reserva atómica de confirmação: só um turno de cada vez pode confirmar este pendente.';


--
-- Name: COLUMN pending_actions.resolved_channel; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pending_actions.resolved_channel IS 'Canal onde o consultor confirmou/recusou (pode diferir da origem).';


--
-- Name: people; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.people (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    phone text,
    email text,
    relationship_type text DEFAULT 'Potencial'::text NOT NULL,
    summary text,
    next_action text,
    next_action_date timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    roles public.person_role[] DEFAULT ARRAY[]::public.person_role[] NOT NULL,
    company text,
    job_title text,
    source_channel text,
    source_message_id uuid,
    source_file_id uuid,
    search_location text,
    search_property_type text,
    budget_min numeric,
    budget_max numeric,
    referred_by_person_id uuid,
    preferences jsonb DEFAULT '{}'::jsonb NOT NULL,
    email_normalized text,
    archived_at timestamp with time zone,
    name_norm text GENERATED ALWAYS AS (public.text_norm(name)) STORED
);

ALTER TABLE ONLY public.people FORCE ROW LEVEL SECURITY;


--
-- Name: person_phones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.person_phones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    person_id uuid NOT NULL,
    raw text NOT NULL,
    e164 text,
    country_code text,
    kind text DEFAULT 'unknown'::text NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pilot_invite_deliveries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pilot_invite_deliveries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pilot_key text NOT NULL,
    recipient_user_id uuid NOT NULL,
    channel text NOT NULL,
    status text DEFAULT 'issuing'::text NOT NULL,
    invite_id uuid,
    requested_by uuid NOT NULL,
    provider_message_id text,
    error_code text,
    error_reason text,
    attempts integer DEFAULT 1 NOT NULL,
    last_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pilot_invite_deliveries_channel_chk CHECK ((channel = ANY (ARRAY['whatsapp'::text, 'telegram'::text]))),
    CONSTRAINT pilot_invite_deliveries_status_chk CHECK ((status = ANY (ARRAY['issuing'::text, 'accepted'::text, 'sent'::text, 'delivered'::text, 'read'::text, 'failed'::text, 'blocked'::text])))
);


--
-- Name: pilot_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pilot_participants (
    pilot_key text NOT NULL,
    user_id uuid NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    source text NOT NULL,
    invite_id uuid,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pilot_participants_source_chk CHECK ((source = ANY (ARRAY['seed'::text, 'invite'::text, 'admin'::text]))),
    CONSTRAINT pilot_participants_status_chk CHECK ((status = ANY (ARRAY['active'::text, 'excluded'::text])))
);


--
-- Name: pilots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pilots (
    key text NOT NULL,
    status text DEFAULT 'no_go'::text NOT NULL,
    invite_issuer_user_id uuid,
    invite_cap integer DEFAULT 2 NOT NULL,
    invite_ttl_days integer DEFAULT 7 NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pilots_cap_chk CHECK ((invite_cap >= 0)),
    CONSTRAINT pilots_status_chk CHECK ((status = ANY (ARRAY['no_go'::text, 'go'::text, 'closed'::text]))),
    CONSTRAINT pilots_ttl_chk CHECK (((invite_ttl_days >= 1) AND (invite_ttl_days <= 30)))
);


--
-- Name: plan_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plan_configs (
    tier text NOT NULL,
    price_month numeric,
    status text DEFAULT 'draft'::text NOT NULL,
    notes text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    pricing_mode text DEFAULT 'paid'::text NOT NULL
);


--
-- Name: proactive_daily_ledger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.proactive_daily_ledger (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    day date NOT NULL,
    source text NOT NULL,
    ref_key text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE proactive_daily_ledger; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.proactive_daily_ledger IS 'Vaga diária (dia de Lisboa) de intervenções não solicitadas, partilhada por todos os emissores proativos.';


--
-- Name: product_feedback; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_feedback (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    kind text DEFAULT 'suggestion'::text NOT NULL,
    body text NOT NULL,
    channel text DEFAULT 'dashboard'::text NOT NULL,
    status text DEFAULT 'novo'::text NOT NULL,
    internal_note text,
    handled_by uuid,
    handled_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    attachment_file_id uuid
);


--
-- Name: product_telemetry_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_telemetry_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    event text NOT NULL,
    lead_id uuid,
    channel text,
    properties jsonb DEFAULT '{}'::jsonb NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: product_updates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_updates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    released_on date DEFAULT CURRENT_DATE NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    category text DEFAULT 'nova_funcionalidade'::text NOT NULL,
    is_published boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    name text,
    email text,
    phone text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    account_kind text DEFAULT 'real'::text NOT NULL,
    phone_verified_at timestamp with time zone,
    whatsapp_link_status text DEFAULT 'unlinked'::text NOT NULL,
    whatsapp_linked_at timestamp with time zone,
    assessor_name text DEFAULT 'Assessor'::text NOT NULL,
    primary_channel text DEFAULT 'whatsapp'::text NOT NULL,
    subscription_tier text DEFAULT 'base'::text NOT NULL,
    is_beta_tester boolean DEFAULT false NOT NULL,
    beta_expires_at timestamp with time zone,
    onboarding_goals text,
    onboarding_stage text DEFAULT 'not_started'::text NOT NULL,
    onboarding_offers integer DEFAULT 0 NOT NULL,
    onboarding_last_offer_at timestamp with time zone,
    telegram_retention_warned_at timestamp with time zone,
    trial_started_at timestamp with time zone,
    trial_expires_at timestamp with time zone,
    trial_tier text,
    trial_status text,
    trial_warned_at timestamp with time zone,
    trial_choice text,
    trial_value_summary_at timestamp with time zone,
    trial_choice_asked_at timestamp with time zone,
    readonly_until timestamp with time zone,
    docs_retention_warned_at timestamp with time zone,
    password_set_at timestamp with time zone,
    password_prompt_skipped_at timestamp with time zone,
    stripe_customer_id text,
    stripe_subscription_id text,
    stripe_price_id text,
    billing_status text DEFAULT 'none'::text NOT NULL,
    billing_source text DEFAULT 'manual'::text NOT NULL,
    billing_environment text DEFAULT 'sandbox'::text NOT NULL,
    billing_manual_lock boolean DEFAULT false NOT NULL,
    work_area text,
    team_context text,
    profile_questions_asked jsonb DEFAULT '[]'::jsonb NOT NULL,
    profile_last_question_at timestamp with time zone,
    profile_refusal_streak integer DEFAULT 0 NOT NULL,
    profile_paused_until timestamp with time zone,
    profile_notice_sent_at timestamp with time zone,
    billing_last_event_at timestamp with time zone,
    CONSTRAINT profiles_account_kind_check CHECK ((account_kind = ANY (ARRAY['real'::text, 'demo'::text, 'merged'::text]))),
    CONSTRAINT profiles_subscription_tier_check CHECK ((subscription_tier = ANY (ARRAY['base'::text, 'consultor'::text, 'pro'::text, 'hub'::text]))),
    CONSTRAINT profiles_trial_status_check CHECK (((trial_status IS NULL) OR (trial_status = ANY (ARRAY['active'::text, 'converted'::text, 'expired'::text])))),
    CONSTRAINT profiles_whatsapp_link_status_check CHECK ((whatsapp_link_status = ANY (ARRAY['unlinked'::text, 'pending'::text, 'linked'::text])))
);

ALTER TABLE ONLY public.profiles FORCE ROW LEVEL SECURITY;


--
-- Name: promo_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.promo_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    grants_tier text DEFAULT 'consultor'::text NOT NULL,
    max_uses integer DEFAULT 1 NOT NULL,
    used_count integer DEFAULT 0 NOT NULL,
    expires_at timestamp with time zone,
    created_by uuid,
    active boolean DEFAULT true NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_beta boolean DEFAULT false NOT NULL,
    beta_days integer,
    invitee_name text,
    invitee_whatsapp text,
    invitee_email text
);


--
-- Name: promo_redemptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.promo_redemptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    code_id uuid NOT NULL,
    code text NOT NULL,
    granted_tier text NOT NULL,
    channel text DEFAULT 'whatsapp'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    expires_at timestamp with time zone,
    confirmed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: properties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.properties (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    owner_person_id uuid,
    title text NOT NULL,
    property_type text,
    location text,
    value numeric(12,2) DEFAULT 0,
    status text DEFAULT 'Angariado'::text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    typology text,
    address text,
    postal_code text,
    city text,
    parish text,
    asking_price numeric(12,2),
    estimated_value numeric(12,2),
    area_gross numeric(10,2),
    area_useful numeric(10,2),
    bedrooms integer,
    bathrooms integer,
    parking integer,
    energy_rating text,
    source_channel text,
    source_message_id uuid,
    category text,
    reserved_at timestamp with time zone,
    sold_at timestamp with time zone,
    sale_price numeric,
    commission_pct numeric,
    commission_amount numeric,
    category_id uuid,
    archived_at timestamp with time zone,
    search_norm text GENERATED ALWAYS AS (public.text_norm(((((((COALESCE(title, ''::text) || ' '::text) || COALESCE(location, ''::text)) || ' '::text) || COALESCE(city, ''::text)) || ' '::text) || COALESCE(address, ''::text)))) STORED
);

ALTER TABLE ONLY public.properties FORCE ROW LEVEL SECURITY;


--
-- Name: property_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.property_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    color text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: property_interests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.property_interests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    property_id uuid NOT NULL,
    opportunity_id uuid,
    person_id uuid,
    name text NOT NULL,
    contact text,
    source text,
    status text DEFAULT 'a_contactar'::text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: property_marketing_activities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.property_marketing_activities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    property_id uuid NOT NULL,
    opportunity_id uuid,
    title text NOT NULL,
    status text DEFAULT 'por_fazer'::text NOT NULL,
    done_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: property_offers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.property_offers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    property_id uuid NOT NULL,
    opportunity_id uuid,
    person_id uuid,
    from_name text,
    amount numeric NOT NULL,
    offer_date timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'pendente'::text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: prospecting_leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prospecting_leads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    phone text,
    location text,
    address text,
    source_type public.prospecting_source_type DEFAULT 'other'::public.prospecting_source_type NOT NULL,
    listing_type public.prospecting_listing_type DEFAULT 'unknown'::public.prospecting_listing_type NOT NULL,
    agency_name text,
    contact_name text,
    property_type text,
    typology text,
    asking_price numeric,
    status public.prospecting_status DEFAULT 'to_contact'::public.prospecting_status NOT NULL,
    notes text,
    source_channel text DEFAULT 'web'::text NOT NULL,
    source_message_id uuid,
    image_file_id uuid,
    related_property_id uuid,
    related_person_id uuid,
    next_follow_up_at timestamp with time zone,
    extraction_confidence numeric,
    extraction_raw jsonb DEFAULT '{}'::jsonb NOT NULL,
    contact_attempts integer DEFAULT 0 NOT NULL,
    last_contact_attempt_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    search_norm text GENERATED ALWAYS AS (public.text_norm(((((COALESCE(title, ''::text) || ' '::text) || COALESCE(location, ''::text)) || ' '::text) || COALESCE(address, ''::text)))) STORED
);


--
-- Name: reminders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reminders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    related_resource_type text NOT NULL,
    related_resource_id uuid,
    scheduled_for timestamp with time zone NOT NULL,
    timezone text DEFAULT 'Europe/Lisbon'::text NOT NULL,
    channel text DEFAULT 'whatsapp'::text NOT NULL,
    status text DEFAULT 'scheduled'::text NOT NULL,
    sent_at timestamp with time zone,
    failed_at timestamp with time zone,
    retry_count integer DEFAULT 0 NOT NULL,
    last_error text,
    external_message_id text,
    idempotency_key text,
    message_preview text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    follow_up_id uuid,
    CONSTRAINT reminders_related_resource_type_check CHECK ((related_resource_type = ANY (ARRAY['follow_up'::text, 'event'::text, 'prospecting_lead'::text, 'other'::text]))),
    CONSTRAINT reminders_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'processing'::text, 'sent'::text, 'failed'::text, 'cancelled'::text])))
);


--
-- Name: routines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.routines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    notes text,
    frequency text DEFAULT 'weekly'::text NOT NULL,
    interval_n integer DEFAULT 1 NOT NULL,
    weekday integer,
    day_of_month integer,
    time_of_day text,
    next_run_at timestamp with time zone DEFAULT now() NOT NULL,
    last_run_at timestamp with time zone,
    priority text DEFAULT 'Média'::text NOT NULL,
    person_id uuid,
    opportunity_id uuid,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    kind text DEFAULT 'follow_up'::text NOT NULL,
    digest_query text,
    CONSTRAINT routines_dom_chk CHECK (((day_of_month IS NULL) OR ((day_of_month >= 1) AND (day_of_month <= 31)))),
    CONSTRAINT routines_frequency_chk CHECK ((frequency = ANY (ARRAY['daily'::text, 'weekly'::text, 'monthly'::text]))),
    CONSTRAINT routines_interval_chk CHECK (((interval_n >= 1) AND (interval_n <= 365))),
    CONSTRAINT routines_kind_check CHECK ((kind = ANY (ARRAY['follow_up'::text, 'digest'::text]))),
    CONSTRAINT routines_weekday_chk CHECK (((weekday IS NULL) OR ((weekday >= 0) AND (weekday <= 6))))
);


--
-- Name: short_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.short_links (
    code text NOT NULL,
    user_id uuid,
    target_path text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone
);


--
-- Name: similar_listing_searches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.similar_listing_searches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    cache_key text NOT NULL,
    query text NOT NULL,
    results jsonb DEFAULT '[]'::jsonb NOT NULL,
    cache_hit boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: staging_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staging_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    synthetic boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: stripe_webhook_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stripe_webhook_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id text NOT NULL,
    event_type text NOT NULL,
    environment text DEFAULT 'sandbox'::text NOT NULL,
    profile_id uuid,
    outcome text DEFAULT 'processed'::text NOT NULL,
    detail text,
    processed_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    stripe_event_created timestamp with time zone
);


--
-- Name: subscription_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscription_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    event text NOT NULL,
    from_tier text,
    to_tier text,
    source text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: support_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    admin_user_id uuid NOT NULL,
    target_user_id uuid NOT NULL,
    reason text,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE support_sessions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.support_sessions IS 'Sessoes de modo apoio: acesso exclusivo do servidor (service_role).';


--
-- Name: tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    color text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: telegram_invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.telegram_invites (
    code text NOT NULL,
    created_by uuid,
    subscription_tier text DEFAULT 'base'::text NOT NULL,
    note text,
    expires_at timestamp with time zone DEFAULT (now() + '30 days'::interval) NOT NULL,
    used_by uuid,
    used_at timestamp with time zone,
    used_chat_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT telegram_invites_subscription_tier_check CHECK ((subscription_tier = ANY (ARRAY['base'::text, 'consultor'::text, 'pro'::text, 'hub'::text])))
);


--
-- Name: telegram_link_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.telegram_link_tokens (
    token text NOT NULL,
    user_id uuid NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    used_chat_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: telegram_pairings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.telegram_pairings (
    chat_id text NOT NULL,
    step text DEFAULT 'asked'::text NOT NULL,
    target_user_id uuid,
    phone text,
    code_hash text,
    attempts integer DEFAULT 0 NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '00:30:00'::interval) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    source_user_id uuid
);


--
-- Name: TABLE telegram_pairings; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.telegram_pairings IS 'Emparelhamentos Telegram: acesso exclusivo do servidor (service_role).';


--
-- Name: COLUMN telegram_pairings.source_user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.telegram_pairings.source_user_id IS 'Conta atual deste chat quando o consultor pede para o ligar a outra conta (nunca há fusão automática).';


--
-- Name: uploaded_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.uploaded_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    channel text DEFAULT 'whatsapp'::text NOT NULL,
    source_message_id uuid,
    external_file_id text,
    original_file_name text,
    internal_file_name text NOT NULL,
    mime_type text NOT NULL,
    size_bytes bigint DEFAULT 0 NOT NULL,
    storage_path text NOT NULL,
    processing_status text DEFAULT 'received'::text NOT NULL,
    classification text,
    extracted_text text,
    extracted_metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    related_resource_type text,
    related_resource_id uuid,
    related_pending_action_id uuid,
    error_code text,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    user_description text,
    document_type text,
    classification_confidence numeric,
    checksum text,
    ai_summary text,
    requires_review boolean DEFAULT false NOT NULL,
    archived_at timestamp with time zone,
    deleted_at timestamp with time zone,
    source_external_file_id text,
    custom_category text,
    custom_category_id uuid,
    opportunity_id uuid,
    retention_archived_at timestamp with time zone,
    retention_warned_at timestamp with time zone,
    doc_issued_on date,
    doc_expires_on date,
    doc_nif text,
    doc_artigo_matricial text,
    doc_fracao text,
    doc_morada text,
    photo_value text,
    doc_group_id uuid,
    doc_page_number integer,
    search_norm text GENERATED ALWAYS AS (public.text_norm(((((((COALESCE(original_file_name, ''::text) || ' '::text) || COALESCE(ai_summary, ''::text)) || ' '::text) || COALESCE(document_type, ''::text)) || ' '::text) || COALESCE(doc_morada, ''::text)))) STORED,
    system_category text,
    duplicate_of uuid
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid
);


--
-- Name: whatsapp_link_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_link_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    phone text NOT NULL,
    code_hash text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: whatsapp_proactive_tests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_proactive_tests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    target_user_id uuid,
    purpose text DEFAULT 'meeting_briefing'::text NOT NULL,
    to_phone text NOT NULL,
    template_name text,
    template_category text,
    hours_since_last_inbound numeric,
    outside_window boolean DEFAULT false NOT NULL,
    forced boolean DEFAULT true NOT NULL,
    send_log_id uuid,
    message_id text,
    status text DEFAULT 'pending'::text NOT NULL,
    cost_eur numeric,
    notes text
);


--
-- Name: whatsapp_send_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_send_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    to_phone text NOT NULL,
    phone_number_id text,
    http_status integer,
    ok boolean DEFAULT false NOT NULL,
    message_id text,
    error_code integer,
    error_subcode integer,
    error_type text,
    error_message text,
    fbtrace_id text,
    triggered_by uuid,
    kind text DEFAULT 'auto'::text NOT NULL,
    purpose text,
    template_name text,
    template_category text,
    template_language text,
    outside_window boolean,
    hours_since_last_inbound numeric,
    billable boolean,
    cost_eur numeric,
    cost_source text,
    delivery_status text DEFAULT 'sent'::text NOT NULL,
    delivered_at timestamp with time zone,
    read_at timestamp with time zone,
    replied_at timestamp with time zone,
    test_id uuid
);


--
-- Name: whatsapp_template_bindings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_template_bindings (
    purpose text NOT NULL,
    template_name text NOT NULL,
    language text DEFAULT 'pt_PT'::text NOT NULL,
    param_count integer DEFAULT 3 NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    fallback_template_name text
);


--
-- Name: whatsapp_template_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_template_rates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category text NOT NULL,
    country_code text DEFAULT 'PT'::text NOT NULL,
    price_eur numeric NOT NULL,
    currency text DEFAULT 'EUR'::text NOT NULL,
    effective_from date DEFAULT CURRENT_DATE NOT NULL,
    source text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid
);


--
-- Name: access_invite_attempts access_invite_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_invite_attempts
    ADD CONSTRAINT access_invite_attempts_pkey PRIMARY KEY (id);


--
-- Name: access_invites access_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_invites
    ADD CONSTRAINT access_invites_pkey PRIMARY KEY (id);


--
-- Name: access_invites access_invites_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_invites
    ADD CONSTRAINT access_invites_token_hash_key UNIQUE (token_hash);


--
-- Name: access_waitlist access_waitlist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_waitlist
    ADD CONSTRAINT access_waitlist_pkey PRIMARY KEY (user_id);


--
-- Name: account_access account_access_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_access
    ADD CONSTRAINT account_access_pkey PRIMARY KEY (user_id);


--
-- Name: admin_audit_logs admin_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_audit_logs
    ADD CONSTRAINT admin_audit_logs_pkey PRIMARY KEY (id);


--
-- Name: admin_broadcast_recipients admin_broadcast_recipients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_broadcast_recipients
    ADD CONSTRAINT admin_broadcast_recipients_pkey PRIMARY KEY (id);


--
-- Name: admin_broadcasts admin_broadcasts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_broadcasts
    ADD CONSTRAINT admin_broadcasts_pkey PRIMARY KEY (id);


--
-- Name: admin_cost_settings admin_cost_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_cost_settings
    ADD CONSTRAINT admin_cost_settings_pkey PRIMARY KEY (key);


--
-- Name: admin_messages admin_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_messages
    ADD CONSTRAINT admin_messages_pkey PRIMARY KEY (id);


--
-- Name: admin_mfa_required admin_mfa_required_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_mfa_required
    ADD CONSTRAINT admin_mfa_required_pkey PRIMARY KEY (user_id);


--
-- Name: ai_model_rates ai_model_rates_model_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_model_rates
    ADD CONSTRAINT ai_model_rates_model_key UNIQUE (model);


--
-- Name: ai_model_rates ai_model_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_model_rates
    ADD CONSTRAINT ai_model_rates_pkey PRIMARY KEY (id);


--
-- Name: alert_mutes alert_mutes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alert_mutes
    ADD CONSTRAINT alert_mutes_pkey PRIMARY KEY (id);


--
-- Name: alert_mutes alert_mutes_user_id_alert_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alert_mutes
    ADD CONSTRAINT alert_mutes_user_id_alert_key_key UNIQUE (user_id, alert_key);


--
-- Name: announcement_dismissals announcement_dismissals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcement_dismissals
    ADD CONSTRAINT announcement_dismissals_pkey PRIMARY KEY (id);


--
-- Name: announcement_dismissals announcement_dismissals_user_id_announcement_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcement_dismissals
    ADD CONSTRAINT announcement_dismissals_user_id_announcement_id_key UNIQUE (user_id, announcement_id);


--
-- Name: app_settings app_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (key);


--
-- Name: app_user_connection_aliases app_user_connection_aliases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_user_connection_aliases
    ADD CONSTRAINT app_user_connection_aliases_pkey PRIMARY KEY (user_id, connector_id);


--
-- Name: app_user_connections app_user_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_user_connections
    ADD CONSTRAINT app_user_connections_pkey PRIMARY KEY (id);


--
-- Name: app_user_connections app_user_connections_user_id_connector_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_user_connections
    ADD CONSTRAINT app_user_connections_user_id_connector_id_key UNIQUE (user_id, connector_id);


--
-- Name: assessor_ai_logs assessor_ai_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessor_ai_logs
    ADD CONSTRAINT assessor_ai_logs_pkey PRIMARY KEY (id);


--
-- Name: assessor_messages assessor_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessor_messages
    ADD CONSTRAINT assessor_messages_pkey PRIMARY KEY (id);


--
-- Name: assessor_nudges assessor_nudges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessor_nudges
    ADD CONSTRAINT assessor_nudges_pkey PRIMARY KEY (id);


--
-- Name: assessor_quality_scores assessor_quality_scores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessor_quality_scores
    ADD CONSTRAINT assessor_quality_scores_pkey PRIMARY KEY (id);


--
-- Name: assessor_reasoning_traces assessor_reasoning_traces_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessor_reasoning_traces
    ADD CONSTRAINT assessor_reasoning_traces_pkey PRIMARY KEY (id);


--
-- Name: assessor_tool_calls assessor_tool_calls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessor_tool_calls
    ADD CONSTRAINT assessor_tool_calls_pkey PRIMARY KEY (id);


--
-- Name: assistant_golden_conversations assistant_golden_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assistant_golden_conversations
    ADD CONSTRAINT assistant_golden_conversations_pkey PRIMARY KEY (id);


--
-- Name: assistant_golden_conversations assistant_golden_conversations_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assistant_golden_conversations
    ADD CONSTRAINT assistant_golden_conversations_slug_key UNIQUE (slug);


--
-- Name: assistant_golden_runs assistant_golden_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assistant_golden_runs
    ADD CONSTRAINT assistant_golden_runs_pkey PRIMARY KEY (id);


--
-- Name: assistant_reflections assistant_reflections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assistant_reflections
    ADD CONSTRAINT assistant_reflections_pkey PRIMARY KEY (id);


--
-- Name: assistant_shadow_runs assistant_shadow_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assistant_shadow_runs
    ADD CONSTRAINT assistant_shadow_runs_pkey PRIMARY KEY (id);


--
-- Name: assistant_trust_scores assistant_trust_scores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assistant_trust_scores
    ADD CONSTRAINT assistant_trust_scores_pkey PRIMARY KEY (id);


--
-- Name: assistant_user_corrections assistant_user_corrections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assistant_user_corrections
    ADD CONSTRAINT assistant_user_corrections_pkey PRIMARY KEY (id);


--
-- Name: autonomy_rules autonomy_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.autonomy_rules
    ADD CONSTRAINT autonomy_rules_pkey PRIMARY KEY (user_id, action_type);


--
-- Name: billing_test_accounts billing_test_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_test_accounts
    ADD CONSTRAINT billing_test_accounts_pkey PRIMARY KEY (user_id);


--
-- Name: calendar_connections calendar_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_connections
    ADD CONSTRAINT calendar_connections_pkey PRIMARY KEY (id);


--
-- Name: calendar_connections calendar_connections_user_id_provider_external_account_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_connections
    ADD CONSTRAINT calendar_connections_user_id_provider_external_account_id_key UNIQUE (user_id, provider, external_account_id);


--
-- Name: calendar_event_links calendar_event_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_event_links
    ADD CONSTRAINT calendar_event_links_pkey PRIMARY KEY (id);


--
-- Name: calendar_event_links calendar_event_links_user_id_provider_external_event_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_event_links
    ADD CONSTRAINT calendar_event_links_user_id_provider_external_event_id_key UNIQUE (user_id, provider, external_event_id);


--
-- Name: calendar_event_links calendar_event_links_user_id_provider_follow_up_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_event_links
    ADD CONSTRAINT calendar_event_links_user_id_provider_follow_up_id_key UNIQUE (user_id, provider, follow_up_id);


--
-- Name: calendar_sync_log calendar_sync_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_sync_log
    ADD CONSTRAINT calendar_sync_log_pkey PRIMARY KEY (id);


--
-- Name: calendar_sync_state calendar_sync_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_sync_state
    ADD CONSTRAINT calendar_sync_state_pkey PRIMARY KEY (id);


--
-- Name: calendar_sync_state calendar_sync_state_user_id_provider_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_sync_state
    ADD CONSTRAINT calendar_sync_state_user_id_provider_key UNIQUE (user_id, provider);


--
-- Name: channel_links channel_links_channel_external_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_links
    ADD CONSTRAINT channel_links_channel_external_id_key UNIQUE (channel, external_id);


--
-- Name: channel_links channel_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_links
    ADD CONSTRAINT channel_links_pkey PRIMARY KEY (id);


--
-- Name: consultant_preferences consultant_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consultant_preferences
    ADD CONSTRAINT consultant_preferences_pkey PRIMARY KEY (user_id);


--
-- Name: content_access_consents content_access_consents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_access_consents
    ADD CONSTRAINT content_access_consents_pkey PRIMARY KEY (id);


--
-- Name: conversation_locks conversation_locks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_locks
    ADD CONSTRAINT conversation_locks_pkey PRIMARY KEY (user_id, channel);


--
-- Name: conversation_states conversation_states_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_states
    ADD CONSTRAINT conversation_states_pkey PRIMARY KEY (id);


--
-- Name: conversation_states conversation_states_unique_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_states
    ADD CONSTRAINT conversation_states_unique_key UNIQUE (user_id, channel, external_conversation_id);


--
-- Name: daily_digests daily_digests_digest_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_digests
    ADD CONSTRAINT daily_digests_digest_date_key UNIQUE (digest_date);


--
-- Name: daily_digests daily_digests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_digests
    ADD CONSTRAINT daily_digests_pkey PRIMARY KEY (id);


--
-- Name: daily_priorities daily_priorities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_priorities
    ADD CONSTRAINT daily_priorities_pkey PRIMARY KEY (id);


--
-- Name: dashboard_announcements dashboard_announcements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dashboard_announcements
    ADD CONSTRAINT dashboard_announcements_pkey PRIMARY KEY (id);


--
-- Name: dashboard_login_tokens dashboard_login_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dashboard_login_tokens
    ADD CONSTRAINT dashboard_login_tokens_pkey PRIMARY KEY (token);


--
-- Name: deal_deadlines deal_deadlines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_deadlines
    ADD CONSTRAINT deal_deadlines_pkey PRIMARY KEY (id);


--
-- Name: email_connections email_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_connections
    ADD CONSTRAINT email_connections_pkey PRIMARY KEY (id);


--
-- Name: email_connections email_connections_user_id_provider_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_connections
    ADD CONSTRAINT email_connections_user_id_provider_key UNIQUE (user_id, provider);


--
-- Name: email_drafts email_drafts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_drafts
    ADD CONSTRAINT email_drafts_pkey PRIMARY KEY (id);


--
-- Name: email_messages email_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_messages
    ADD CONSTRAINT email_messages_pkey PRIMARY KEY (id);


--
-- Name: email_threads email_threads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_threads
    ADD CONSTRAINT email_threads_pkey PRIMARY KEY (id);


--
-- Name: email_threads email_threads_user_id_provider_provider_thread_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_threads
    ADD CONSTRAINT email_threads_user_id_provider_provider_thread_id_key UNIQUE (user_id, provider, provider_thread_id);


--
-- Name: entity_tags entity_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_tags
    ADD CONSTRAINT entity_tags_pkey PRIMARY KEY (id);


--
-- Name: entity_tags entity_tags_tag_id_entity_type_entity_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_tags
    ADD CONSTRAINT entity_tags_tag_id_entity_type_entity_id_key UNIQUE (tag_id, entity_type, entity_id);


--
-- Name: event_categories event_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_categories
    ADD CONSTRAINT event_categories_pkey PRIMARY KEY (id);


--
-- Name: event_categories event_categories_user_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_categories
    ADD CONSTRAINT event_categories_user_id_name_key UNIQUE (user_id, name);


--
-- Name: feature_flag_users feature_flag_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feature_flag_users
    ADD CONSTRAINT feature_flag_users_pkey PRIMARY KEY (flag_key, user_id);


--
-- Name: feature_flags feature_flags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feature_flags
    ADD CONSTRAINT feature_flags_pkey PRIMARY KEY (key);


--
-- Name: file_categories file_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_categories
    ADD CONSTRAINT file_categories_pkey PRIMARY KEY (id);


--
-- Name: file_categories file_categories_user_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_categories
    ADD CONSTRAINT file_categories_user_id_name_key UNIQUE (user_id, name);


--
-- Name: file_links file_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_links
    ADD CONSTRAINT file_links_pkey PRIMARY KEY (id);


--
-- Name: file_links file_links_user_id_file_id_entity_type_entity_id_relation_t_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_links
    ADD CONSTRAINT file_links_user_id_file_id_entity_type_entity_id_relation_t_key UNIQUE (user_id, file_id, entity_type, entity_id, relation_type);


--
-- Name: financial_movements financial_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_movements
    ADD CONSTRAINT financial_movements_pkey PRIMARY KEY (id);


--
-- Name: folder_items folder_items_folder_id_entity_type_entity_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folder_items
    ADD CONSTRAINT folder_items_folder_id_entity_type_entity_id_key UNIQUE (folder_id, entity_type, entity_id);


--
-- Name: folder_items folder_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folder_items
    ADD CONSTRAINT folder_items_pkey PRIMARY KEY (id);


--
-- Name: folders folders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folders
    ADD CONSTRAINT folders_pkey PRIMARY KEY (id);


--
-- Name: follow_ups follow_ups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follow_ups
    ADD CONSTRAINT follow_ups_pkey PRIMARY KEY (id);


--
-- Name: inbound_message_claims inbound_message_claims_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbound_message_claims
    ADD CONSTRAINT inbound_message_claims_pkey PRIMARY KEY (channel, external_message_id);


--
-- Name: interactions interactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interactions
    ADD CONSTRAINT interactions_pkey PRIMARY KEY (id);


--
-- Name: invite_send_attempts invite_send_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invite_send_attempts
    ADD CONSTRAINT invite_send_attempts_pkey PRIMARY KEY (id);


--
-- Name: landing_page_visits landing_page_visits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_page_visits
    ADD CONSTRAINT landing_page_visits_pkey PRIMARY KEY (id);


--
-- Name: mentor_decisions mentor_decisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mentor_decisions
    ADD CONSTRAINT mentor_decisions_pkey PRIMARY KEY (id);


--
-- Name: miscellaneous_items miscellaneous_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.miscellaneous_items
    ADD CONSTRAINT miscellaneous_items_pkey PRIMARY KEY (id);


--
-- Name: opportunities opportunities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opportunities
    ADD CONSTRAINT opportunities_pkey PRIMARY KEY (id);


--
-- Name: opportunity_events opportunity_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opportunity_events
    ADD CONSTRAINT opportunity_events_pkey PRIMARY KEY (id);


--
-- Name: opportunity_properties opportunity_properties_opportunity_id_property_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opportunity_properties
    ADD CONSTRAINT opportunity_properties_opportunity_id_property_id_key UNIQUE (opportunity_id, property_id);


--
-- Name: opportunity_properties opportunity_properties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opportunity_properties
    ADD CONSTRAINT opportunity_properties_pkey PRIMARY KEY (id);


--
-- Name: pending_actions pending_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_actions
    ADD CONSTRAINT pending_actions_pkey PRIMARY KEY (id);


--
-- Name: people people_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.people
    ADD CONSTRAINT people_pkey PRIMARY KEY (id);


--
-- Name: person_phones person_phones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.person_phones
    ADD CONSTRAINT person_phones_pkey PRIMARY KEY (id);


--
-- Name: pilot_invite_deliveries pilot_invite_deliveries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pilot_invite_deliveries
    ADD CONSTRAINT pilot_invite_deliveries_pkey PRIMARY KEY (id);


--
-- Name: pilot_invite_deliveries pilot_invite_deliveries_recipient_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pilot_invite_deliveries
    ADD CONSTRAINT pilot_invite_deliveries_recipient_uniq UNIQUE (pilot_key, recipient_user_id);


--
-- Name: pilot_participants pilot_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pilot_participants
    ADD CONSTRAINT pilot_participants_pkey PRIMARY KEY (pilot_key, user_id);


--
-- Name: pilots pilots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pilots
    ADD CONSTRAINT pilots_pkey PRIMARY KEY (key);


--
-- Name: plan_configs plan_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_configs
    ADD CONSTRAINT plan_configs_pkey PRIMARY KEY (tier);


--
-- Name: proactive_daily_ledger proactive_daily_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proactive_daily_ledger
    ADD CONSTRAINT proactive_daily_ledger_pkey PRIMARY KEY (id);


--
-- Name: proactive_daily_ledger proactive_daily_ledger_user_id_day_ref_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proactive_daily_ledger
    ADD CONSTRAINT proactive_daily_ledger_user_id_day_ref_key_key UNIQUE (user_id, day, ref_key);


--
-- Name: product_feedback product_feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_feedback
    ADD CONSTRAINT product_feedback_pkey PRIMARY KEY (id);


--
-- Name: product_telemetry_events product_telemetry_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_telemetry_events
    ADD CONSTRAINT product_telemetry_events_pkey PRIMARY KEY (id);


--
-- Name: product_updates product_updates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_updates
    ADD CONSTRAINT product_updates_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: promo_codes promo_codes_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promo_codes
    ADD CONSTRAINT promo_codes_code_key UNIQUE (code);


--
-- Name: promo_codes promo_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promo_codes
    ADD CONSTRAINT promo_codes_pkey PRIMARY KEY (id);


--
-- Name: promo_redemptions promo_redemptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promo_redemptions
    ADD CONSTRAINT promo_redemptions_pkey PRIMARY KEY (id);


--
-- Name: promo_redemptions promo_redemptions_user_id_code_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promo_redemptions
    ADD CONSTRAINT promo_redemptions_user_id_code_id_key UNIQUE (user_id, code_id);


--
-- Name: properties properties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.properties
    ADD CONSTRAINT properties_pkey PRIMARY KEY (id);


--
-- Name: property_categories property_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_categories
    ADD CONSTRAINT property_categories_pkey PRIMARY KEY (id);


--
-- Name: property_categories property_categories_user_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_categories
    ADD CONSTRAINT property_categories_user_id_name_key UNIQUE (user_id, name);


--
-- Name: property_interests property_interests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_interests
    ADD CONSTRAINT property_interests_pkey PRIMARY KEY (id);


--
-- Name: property_marketing_activities property_marketing_activities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_marketing_activities
    ADD CONSTRAINT property_marketing_activities_pkey PRIMARY KEY (id);


--
-- Name: property_offers property_offers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_offers
    ADD CONSTRAINT property_offers_pkey PRIMARY KEY (id);


--
-- Name: prospecting_leads prospecting_leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prospecting_leads
    ADD CONSTRAINT prospecting_leads_pkey PRIMARY KEY (id);


--
-- Name: reminders reminders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminders
    ADD CONSTRAINT reminders_pkey PRIMARY KEY (id);


--
-- Name: routines routines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routines
    ADD CONSTRAINT routines_pkey PRIMARY KEY (id);


--
-- Name: short_links short_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.short_links
    ADD CONSTRAINT short_links_pkey PRIMARY KEY (code);


--
-- Name: similar_listing_searches similar_listing_searches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.similar_listing_searches
    ADD CONSTRAINT similar_listing_searches_pkey PRIMARY KEY (id);


--
-- Name: staging_notes staging_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staging_notes
    ADD CONSTRAINT staging_notes_pkey PRIMARY KEY (id);


--
-- Name: stripe_webhook_events stripe_webhook_events_event_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stripe_webhook_events
    ADD CONSTRAINT stripe_webhook_events_event_id_key UNIQUE (event_id);


--
-- Name: stripe_webhook_events stripe_webhook_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stripe_webhook_events
    ADD CONSTRAINT stripe_webhook_events_pkey PRIMARY KEY (id);


--
-- Name: subscription_events subscription_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_events
    ADD CONSTRAINT subscription_events_pkey PRIMARY KEY (id);


--
-- Name: support_sessions support_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_sessions
    ADD CONSTRAINT support_sessions_pkey PRIMARY KEY (id);


--
-- Name: tags tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_pkey PRIMARY KEY (id);


--
-- Name: telegram_invites telegram_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_invites
    ADD CONSTRAINT telegram_invites_pkey PRIMARY KEY (code);


--
-- Name: telegram_link_tokens telegram_link_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_link_tokens
    ADD CONSTRAINT telegram_link_tokens_pkey PRIMARY KEY (token);


--
-- Name: telegram_pairings telegram_pairings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_pairings
    ADD CONSTRAINT telegram_pairings_pkey PRIMARY KEY (chat_id);


--
-- Name: uploaded_files uploaded_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uploaded_files
    ADD CONSTRAINT uploaded_files_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);


--
-- Name: whatsapp_link_codes whatsapp_link_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_link_codes
    ADD CONSTRAINT whatsapp_link_codes_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_proactive_tests whatsapp_proactive_tests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_proactive_tests
    ADD CONSTRAINT whatsapp_proactive_tests_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_send_logs whatsapp_send_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_send_logs
    ADD CONSTRAINT whatsapp_send_logs_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_template_bindings whatsapp_template_bindings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_template_bindings
    ADD CONSTRAINT whatsapp_template_bindings_pkey PRIMARY KEY (purpose);


--
-- Name: whatsapp_template_rates whatsapp_template_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_template_rates
    ADD CONSTRAINT whatsapp_template_rates_pkey PRIMARY KEY (id);


--
-- Name: access_invite_attempts_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX access_invite_attempts_user_idx ON public.access_invite_attempts USING btree (user_id, created_at DESC);


--
-- Name: access_invites_idem_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX access_invites_idem_uidx ON public.access_invites USING btree (issuer_user_id, idempotency_key) WHERE (idempotency_key IS NOT NULL);


--
-- Name: access_invites_issuer_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX access_invites_issuer_idx ON public.access_invites USING btree (issuer_user_id, status);


--
-- Name: access_invites_pilot_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX access_invites_pilot_idx ON public.access_invites USING btree (pilot_key, status) WHERE (pilot_key IS NOT NULL);


--
-- Name: admin_audit_logs_action_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_audit_logs_action_created_idx ON public.admin_audit_logs USING btree (action, created_at DESC);


--
-- Name: admin_audit_logs_resource_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_audit_logs_resource_type_idx ON public.admin_audit_logs USING btree (resource_type, created_at DESC);


--
-- Name: admin_messages_consultor_estado_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_messages_consultor_estado_idx ON public.admin_messages USING btree (consultor_id, estado, janela_expira_em DESC);


--
-- Name: announcement_dismissals_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX announcement_dismissals_user_idx ON public.announcement_dismissals USING btree (user_id);


--
-- Name: assessor_ai_logs_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX assessor_ai_logs_created_at_idx ON public.assessor_ai_logs USING btree (created_at DESC);


--
-- Name: assessor_ai_logs_user_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX assessor_ai_logs_user_created_idx ON public.assessor_ai_logs USING btree (user_id, created_at DESC);


--
-- Name: assessor_ai_logs_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX assessor_ai_logs_user_id_idx ON public.assessor_ai_logs USING btree (user_id);


--
-- Name: assessor_messages_channel_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX assessor_messages_channel_created_idx ON public.assessor_messages USING btree (channel, created_at DESC);


--
-- Name: assessor_messages_conversation_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX assessor_messages_conversation_idx ON public.assessor_messages USING btree (user_id, channel, conversation_id, created_at DESC);


--
-- Name: assessor_messages_deferred_lock_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX assessor_messages_deferred_lock_idx ON public.assessor_messages USING btree (created_at) WHERE (status = 'deferred_lock'::text);


--
-- Name: assessor_messages_pending_action_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX assessor_messages_pending_action_idx ON public.assessor_messages USING btree (related_pending_action_id);


--
-- Name: assessor_messages_retention_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX assessor_messages_retention_idx ON public.assessor_messages USING btree (channel, archived_at, created_at);


--
-- Name: assessor_messages_wa_msg_id_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX assessor_messages_wa_msg_id_uniq ON public.assessor_messages USING btree (whatsapp_message_id) WHERE (whatsapp_message_id IS NOT NULL);


--
-- Name: assessor_nudges_dedupe_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX assessor_nudges_dedupe_uidx ON public.assessor_nudges USING btree (user_id, dedupe_key) WHERE (dedupe_key IS NOT NULL);


--
-- Name: assessor_nudges_user_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX assessor_nudges_user_status_idx ON public.assessor_nudges USING btree (user_id, status, scheduled_for);


--
-- Name: assessor_quality_scores_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX assessor_quality_scores_created_idx ON public.assessor_quality_scores USING btree (created_at DESC);


--
-- Name: assessor_quality_scores_user_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX assessor_quality_scores_user_created_idx ON public.assessor_quality_scores USING btree (user_id, created_at DESC);


--
-- Name: assessor_reasoning_traces_user_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX assessor_reasoning_traces_user_created_idx ON public.assessor_reasoning_traces USING btree (user_id, created_at DESC);


--
-- Name: assessor_tool_calls_user_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX assessor_tool_calls_user_created_idx ON public.assessor_tool_calls USING btree (user_id, created_at DESC);


--
-- Name: calendar_event_links_series_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX calendar_event_links_series_idx ON public.calendar_event_links USING btree (user_id, provider, series_master_id);


--
-- Name: channel_links_user_channel_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX channel_links_user_channel_idx ON public.channel_links USING btree (user_id, channel);


--
-- Name: conversation_states_user_channel_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX conversation_states_user_channel_idx ON public.conversation_states USING btree (user_id, channel);


--
-- Name: daily_digests_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX daily_digests_date_idx ON public.daily_digests USING btree (digest_date DESC);


--
-- Name: daily_priorities_user_score_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX daily_priorities_user_score_idx ON public.daily_priorities USING btree (user_id, priority_score DESC) WHERE ((dismissed_at IS NULL) AND (completed_at IS NULL));


--
-- Name: daily_priorities_user_subject_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX daily_priorities_user_subject_uidx ON public.daily_priorities USING btree (user_id, subject_type, subject_id) WHERE ((subject_id IS NOT NULL) AND (dismissed_at IS NULL) AND (completed_at IS NULL));


--
-- Name: deal_deadlines_opportunity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX deal_deadlines_opportunity_idx ON public.deal_deadlines USING btree (opportunity_id);


--
-- Name: deal_deadlines_user_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX deal_deadlines_user_due_idx ON public.deal_deadlines USING btree (user_id, due_date);


--
-- Name: email_drafts_person_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_drafts_person_idx ON public.email_drafts USING btree (user_id, person_id);


--
-- Name: email_drafts_user_provider_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_drafts_user_provider_idx ON public.email_drafts USING btree (user_id, provider);


--
-- Name: email_drafts_user_recent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_drafts_user_recent_idx ON public.email_drafts USING btree (user_id, created_at DESC);


--
-- Name: email_drafts_user_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_drafts_user_status_idx ON public.email_drafts USING btree (user_id, status);


--
-- Name: email_messages_from_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_messages_from_idx ON public.email_messages USING btree (user_id, from_email);


--
-- Name: email_messages_thread_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_messages_thread_idx ON public.email_messages USING btree (thread_id, sent_at DESC);


--
-- Name: email_messages_user_provider_msg_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX email_messages_user_provider_msg_key ON public.email_messages USING btree (user_id, provider, provider_message_id);


--
-- Name: email_threads_person_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_threads_person_idx ON public.email_threads USING btree (person_id);


--
-- Name: email_threads_user_last_msg_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_threads_user_last_msg_idx ON public.email_threads USING btree (user_id, last_message_at DESC);


--
-- Name: entity_tags_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX entity_tags_lookup ON public.entity_tags USING btree (user_id, entity_type, entity_id);


--
-- Name: entity_tags_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX entity_tags_user_id_idx ON public.entity_tags USING btree (user_id);


--
-- Name: file_links_user_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX file_links_user_entity_idx ON public.file_links USING btree (user_id, entity_type, entity_id);


--
-- Name: file_links_user_file_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX file_links_user_file_idx ON public.file_links USING btree (user_id, file_id);


--
-- Name: file_links_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX file_links_user_id_idx ON public.file_links USING btree (user_id);


--
-- Name: financial_movements_user_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX financial_movements_user_active_idx ON public.financial_movements USING btree (user_id) WHERE (archived_at IS NULL);


--
-- Name: folder_items_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX folder_items_lookup ON public.folder_items USING btree (user_id, entity_type, entity_id);


--
-- Name: folder_items_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX folder_items_user_id_idx ON public.folder_items USING btree (user_id);


--
-- Name: folders_user_name_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX folders_user_name_uniq ON public.folders USING btree (user_id, lower(name));


--
-- Name: follow_ups_briefing_pending_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX follow_ups_briefing_pending_idx ON public.follow_ups USING btree (due_date) WHERE ((briefing_sent_at IS NULL) AND (person_id IS NOT NULL));


--
-- Name: follow_ups_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX follow_ups_due_idx ON public.follow_ups USING btree (user_id, due_date);


--
-- Name: follow_ups_prospecting_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX follow_ups_prospecting_idx ON public.follow_ups USING btree (related_prospecting_lead_id) WHERE (related_prospecting_lead_id IS NOT NULL);


--
-- Name: follow_ups_related_property_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX follow_ups_related_property_id_idx ON public.follow_ups USING btree (related_property_id);


--
-- Name: follow_ups_source_channel_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX follow_ups_source_channel_idx ON public.follow_ups USING btree (source_channel) WHERE (source_channel IS NOT NULL);


--
-- Name: follow_ups_source_message_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX follow_ups_source_message_id_idx ON public.follow_ups USING btree (source_message_id) WHERE (source_message_id IS NOT NULL);


--
-- Name: follow_ups_source_pending_action_id_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX follow_ups_source_pending_action_id_uidx ON public.follow_ups USING btree (source_pending_action_id) WHERE (source_pending_action_id IS NOT NULL);


--
-- Name: follow_ups_user_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX follow_ups_user_active_idx ON public.follow_ups USING btree (user_id) WHERE (archived_at IS NULL);


--
-- Name: follow_ups_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX follow_ups_user_idx ON public.follow_ups USING btree (user_id);


--
-- Name: idx_abr_broadcast; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_abr_broadcast ON public.admin_broadcast_recipients USING btree (broadcast_id);


--
-- Name: idx_cac_user_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cac_user_status ON public.content_access_consents USING btree (user_id, status);


--
-- Name: idx_cal_links_user_provider; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cal_links_user_provider ON public.calendar_event_links USING btree (user_id, provider);


--
-- Name: idx_cal_log_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cal_log_user_created ON public.calendar_sync_log USING btree (user_id, created_at DESC);


--
-- Name: idx_corrections_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_corrections_category ON public.assistant_user_corrections USING btree (category);


--
-- Name: idx_corrections_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_corrections_user_created ON public.assistant_user_corrections USING btree (user_id, created_at DESC);


--
-- Name: idx_dashboard_login_tokens_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dashboard_login_tokens_user ON public.dashboard_login_tokens USING btree (user_id);


--
-- Name: idx_follow_ups_event_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_follow_ups_event_category ON public.follow_ups USING btree (user_id, event_category);


--
-- Name: idx_follow_ups_event_category_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_follow_ups_event_category_id ON public.follow_ups USING btree (event_category_id);


--
-- Name: idx_follow_ups_related_file_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_follow_ups_related_file_id ON public.follow_ups USING btree (related_file_id);


--
-- Name: idx_golden_runs_golden; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golden_runs_golden ON public.assistant_golden_runs USING btree (golden_id, created_at DESC);


--
-- Name: idx_golden_runs_release; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_golden_runs_release ON public.assistant_golden_runs USING btree (release_ref);


--
-- Name: idx_opportunities_source_lead_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_opportunities_source_lead_id ON public.opportunities USING btree (source_lead_id) WHERE (source_lead_id IS NOT NULL);


--
-- Name: idx_profiles_stripe_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_stripe_customer ON public.profiles USING btree (stripe_customer_id);


--
-- Name: idx_profiles_stripe_subscription; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_stripe_subscription ON public.profiles USING btree (stripe_subscription_id);


--
-- Name: idx_reflections_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reflections_created ON public.assistant_reflections USING btree (created_at DESC);


--
-- Name: idx_shadow_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shadow_created ON public.assistant_shadow_runs USING btree (created_at DESC);


--
-- Name: idx_shadow_strategy; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shadow_strategy ON public.assistant_shadow_runs USING btree (strategy);


--
-- Name: idx_similar_listing_cache; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_similar_listing_cache ON public.similar_listing_searches USING btree (user_id, cache_key, created_at DESC);


--
-- Name: idx_similar_listing_daily; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_similar_listing_daily ON public.similar_listing_searches USING btree (user_id, created_at DESC);


--
-- Name: idx_stripe_events_profile; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stripe_events_profile ON public.stripe_webhook_events USING btree (profile_id, processed_at DESC);


--
-- Name: idx_telegram_link_tokens_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_telegram_link_tokens_user ON public.telegram_link_tokens USING btree (user_id);


--
-- Name: idx_trust_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trust_created ON public.assistant_trust_scores USING btree (created_at DESC);


--
-- Name: idx_trust_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trust_user ON public.assistant_trust_scores USING btree (user_id, created_at DESC);


--
-- Name: inbound_message_claims_claimed_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inbound_message_claims_claimed_at_idx ON public.inbound_message_claims USING btree (claimed_at);


--
-- Name: interactions_property_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX interactions_property_idx ON public.interactions USING btree (property_id);


--
-- Name: interactions_user_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX interactions_user_active_idx ON public.interactions USING btree (user_id) WHERE (archived_at IS NULL);


--
-- Name: interactions_user_confidential_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX interactions_user_confidential_idx ON public.interactions USING btree (user_id, is_confidential);


--
-- Name: interactions_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX interactions_user_idx ON public.interactions USING btree (user_id);


--
-- Name: invite_send_attempts_open_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX invite_send_attempts_open_uniq ON public.invite_send_attempts USING btree (user_id, canal) WHERE (status = 'pendente'::text);


--
-- Name: invite_send_attempts_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invite_send_attempts_status_idx ON public.invite_send_attempts USING btree (status, last_attempt_at DESC);


--
-- Name: landing_page_visits_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX landing_page_visits_date_idx ON public.landing_page_visits USING btree (visit_date);


--
-- Name: mentor_decisions_user_key_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mentor_decisions_user_key_idx ON public.mentor_decisions USING btree (user_id, tip_key, created_at DESC);


--
-- Name: messages_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX messages_user_idx ON public.assessor_messages USING btree (user_id, created_at);


--
-- Name: miscellaneous_items_item_class_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX miscellaneous_items_item_class_idx ON public.miscellaneous_items USING btree (user_id, item_class, created_at DESC);


--
-- Name: miscellaneous_items_team_suggestion_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX miscellaneous_items_team_suggestion_idx ON public.miscellaneous_items USING btree (created_at DESC) WHERE ((category ~~* 'sugest%'::text) OR (title ~~* 'sugest%'::text));


--
-- Name: miscellaneous_items_user_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX miscellaneous_items_user_active_idx ON public.miscellaneous_items USING btree (user_id) WHERE (archived_at IS NULL);


--
-- Name: miscellaneous_items_user_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX miscellaneous_items_user_created_idx ON public.miscellaneous_items USING btree (user_id, created_at DESC);


--
-- Name: movements_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX movements_user_idx ON public.financial_movements USING btree (user_id);


--
-- Name: opportunities_user_archived_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX opportunities_user_archived_idx ON public.opportunities USING btree (user_id, archived_at);


--
-- Name: opportunities_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX opportunities_user_idx ON public.opportunities USING btree (user_id);


--
-- Name: opportunities_user_stage_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX opportunities_user_stage_idx ON public.opportunities USING btree (user_id, stage);


--
-- Name: opportunity_events_opp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX opportunity_events_opp_idx ON public.opportunity_events USING btree (opportunity_id, occurred_at DESC);


--
-- Name: opportunity_properties_opp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX opportunity_properties_opp_idx ON public.opportunity_properties USING btree (opportunity_id);


--
-- Name: opportunity_properties_prop_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX opportunity_properties_prop_idx ON public.opportunity_properties USING btree (user_id, property_id);


--
-- Name: pending_actions_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pending_actions_expires_at_idx ON public.pending_actions USING btree (expires_at);


--
-- Name: pending_actions_user_channel_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pending_actions_user_channel_status_idx ON public.pending_actions USING btree (user_id, channel, status, created_at DESC);


--
-- Name: pending_actions_user_status_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pending_actions_user_status_created_idx ON public.pending_actions USING btree (user_id, status, created_at DESC);


--
-- Name: people_name_norm_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX people_name_norm_idx ON public.people USING btree (name_norm text_pattern_ops);


--
-- Name: people_user_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX people_user_active_idx ON public.people USING btree (user_id) WHERE (archived_at IS NULL);


--
-- Name: people_user_email_norm_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX people_user_email_norm_idx ON public.people USING btree (user_id, email_normalized);


--
-- Name: people_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX people_user_idx ON public.people USING btree (user_id);


--
-- Name: people_user_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX people_user_name_idx ON public.people USING btree (user_id, lower(name));


--
-- Name: person_phones_person_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX person_phones_person_idx ON public.person_phones USING btree (person_id);


--
-- Name: person_phones_user_e164_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX person_phones_user_e164_idx ON public.person_phones USING btree (user_id, e164) WHERE (e164 IS NOT NULL);


--
-- Name: person_phones_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX person_phones_user_id_idx ON public.person_phones USING btree (user_id);


--
-- Name: pilot_invite_deliveries_provider_msg_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pilot_invite_deliveries_provider_msg_idx ON public.pilot_invite_deliveries USING btree (provider_message_id) WHERE (provider_message_id IS NOT NULL);


--
-- Name: product_feedback_attachment_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_feedback_attachment_idx ON public.product_feedback USING btree (attachment_file_id) WHERE (attachment_file_id IS NOT NULL);


--
-- Name: product_feedback_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_feedback_status_idx ON public.product_feedback USING btree (status, created_at DESC);


--
-- Name: product_feedback_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_feedback_user_idx ON public.product_feedback USING btree (user_id, created_at DESC);


--
-- Name: product_telemetry_events_lead_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_telemetry_events_lead_idx ON public.product_telemetry_events USING btree (lead_id);


--
-- Name: product_telemetry_events_user_event_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_telemetry_events_user_event_idx ON public.product_telemetry_events USING btree (user_id, event, occurred_at DESC);


--
-- Name: product_updates_released_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_updates_released_idx ON public.product_updates USING btree (released_on DESC);


--
-- Name: profiles_phone_linked_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX profiles_phone_linked_unique ON public.profiles USING btree (phone) WHERE (whatsapp_link_status = 'linked'::text);


--
-- Name: promo_redemptions_user_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX promo_redemptions_user_status_idx ON public.promo_redemptions USING btree (user_id, status, created_at DESC);


--
-- Name: properties_category_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX properties_category_id_idx ON public.properties USING btree (category_id);


--
-- Name: properties_search_norm_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX properties_search_norm_idx ON public.properties USING btree (search_norm text_pattern_ops);


--
-- Name: properties_user_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX properties_user_active_idx ON public.properties USING btree (user_id) WHERE (archived_at IS NULL);


--
-- Name: properties_user_city_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX properties_user_city_idx ON public.properties USING btree (user_id, city);


--
-- Name: properties_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX properties_user_idx ON public.properties USING btree (user_id);


--
-- Name: properties_user_typology_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX properties_user_typology_idx ON public.properties USING btree (user_id, typology);


--
-- Name: property_interests_prop_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX property_interests_prop_idx ON public.property_interests USING btree (property_id);


--
-- Name: property_marketing_prop_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX property_marketing_prop_idx ON public.property_marketing_activities USING btree (property_id);


--
-- Name: property_offers_prop_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX property_offers_prop_idx ON public.property_offers USING btree (property_id);


--
-- Name: prospecting_leads_user_phone_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX prospecting_leads_user_phone_idx ON public.prospecting_leads USING btree (user_id, phone);


--
-- Name: prospecting_leads_user_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX prospecting_leads_user_status_idx ON public.prospecting_leads USING btree (user_id, status, created_at DESC);


--
-- Name: reminders_active_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX reminders_active_unique ON public.reminders USING btree (user_id, related_resource_type, related_resource_id) WHERE ((status = ANY (ARRAY['scheduled'::text, 'processing'::text])) AND (related_resource_id IS NOT NULL));


--
-- Name: reminders_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reminders_due_idx ON public.reminders USING btree (status, scheduled_for) WHERE (status = ANY (ARRAY['scheduled'::text, 'processing'::text]));


--
-- Name: reminders_follow_up_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reminders_follow_up_id_idx ON public.reminders USING btree (follow_up_id);


--
-- Name: reminders_idempotency; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX reminders_idempotency ON public.reminders USING btree (user_id, idempotency_key) WHERE (idempotency_key IS NOT NULL);


--
-- Name: routines_user_next_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX routines_user_next_idx ON public.routines USING btree (user_id, active, next_run_at);


--
-- Name: short_links_user_target_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX short_links_user_target_idx ON public.short_links USING btree (user_id, target_path);


--
-- Name: subscription_events_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX subscription_events_created_idx ON public.subscription_events USING btree (created_at DESC);


--
-- Name: subscription_events_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX subscription_events_user_idx ON public.subscription_events USING btree (user_id, created_at DESC);


--
-- Name: support_sessions_admin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX support_sessions_admin_idx ON public.support_sessions USING btree (admin_user_id, started_at DESC);


--
-- Name: support_sessions_open_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX support_sessions_open_idx ON public.support_sessions USING btree (target_user_id) WHERE (ended_at IS NULL);


--
-- Name: tags_user_name_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX tags_user_name_uniq ON public.tags USING btree (user_id, lower(name));


--
-- Name: uploaded_files_custom_category_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX uploaded_files_custom_category_id_idx ON public.uploaded_files USING btree (custom_category_id);


--
-- Name: uploaded_files_doc_group_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX uploaded_files_doc_group_idx ON public.uploaded_files USING btree (user_id, doc_group_id) WHERE (doc_group_id IS NOT NULL);


--
-- Name: uploaded_files_duplicate_of_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX uploaded_files_duplicate_of_idx ON public.uploaded_files USING btree (duplicate_of) WHERE (duplicate_of IS NOT NULL);


--
-- Name: uploaded_files_expiry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX uploaded_files_expiry_idx ON public.uploaded_files USING btree (user_id, doc_expires_on) WHERE ((doc_expires_on IS NOT NULL) AND (deleted_at IS NULL));


--
-- Name: uploaded_files_opportunity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX uploaded_files_opportunity_idx ON public.uploaded_files USING btree (user_id, opportunity_id);


--
-- Name: uploaded_files_related_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX uploaded_files_related_idx ON public.uploaded_files USING btree (related_resource_type, related_resource_id);


--
-- Name: uploaded_files_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX uploaded_files_status_idx ON public.uploaded_files USING btree (processing_status);


--
-- Name: uploaded_files_user_checksum_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX uploaded_files_user_checksum_idx ON public.uploaded_files USING btree (user_id, checksum) WHERE (checksum IS NOT NULL);


--
-- Name: uploaded_files_user_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX uploaded_files_user_created_idx ON public.uploaded_files USING btree (user_id, created_at DESC);


--
-- Name: uploaded_files_user_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX uploaded_files_user_status_idx ON public.uploaded_files USING btree (user_id, processing_status) WHERE (deleted_at IS NULL);


--
-- Name: uploaded_files_user_system_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX uploaded_files_user_system_category_idx ON public.uploaded_files USING btree (user_id, system_category) WHERE (system_category IS NOT NULL);


--
-- Name: whatsapp_link_codes_hash_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX whatsapp_link_codes_hash_idx ON public.whatsapp_link_codes USING btree (code_hash) WHERE (used_at IS NULL);


--
-- Name: whatsapp_link_codes_phone_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX whatsapp_link_codes_phone_active_idx ON public.whatsapp_link_codes USING btree (phone) WHERE (used_at IS NULL);


--
-- Name: whatsapp_link_codes_user_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX whatsapp_link_codes_user_active_idx ON public.whatsapp_link_codes USING btree (user_id, created_at DESC);


--
-- Name: whatsapp_send_logs_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX whatsapp_send_logs_created_idx ON public.whatsapp_send_logs USING btree (created_at DESC);


--
-- Name: whatsapp_send_logs_message_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX whatsapp_send_logs_message_id_idx ON public.whatsapp_send_logs USING btree (message_id) WHERE (message_id IS NOT NULL);


--
-- Name: whatsapp_send_logs_template_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX whatsapp_send_logs_template_idx ON public.whatsapp_send_logs USING btree (created_at DESC) WHERE (template_name IS NOT NULL);


--
-- Name: whatsapp_template_rates_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX whatsapp_template_rates_unique_idx ON public.whatsapp_template_rates USING btree (category, country_code, effective_from);


--
-- Name: access_invites access_invites_pilot_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER access_invites_pilot_guard BEFORE INSERT OR UPDATE ON public.access_invites FOR EACH ROW EXECUTE FUNCTION public.access_invites_pilot_guard();


--
-- Name: access_invites access_invites_pilot_participant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER access_invites_pilot_participant AFTER UPDATE OF status ON public.access_invites FOR EACH ROW EXECUTE FUNCTION public.pilot_participant_on_invite_used();


--
-- Name: alert_mutes alert_mutes_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER alert_mutes_set_updated_at BEFORE UPDATE ON public.alert_mutes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: app_user_connections app_user_connections_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER app_user_connections_set_updated_at BEFORE UPDATE ON public.app_user_connections FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: assessor_nudges assessor_nudges_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER assessor_nudges_set_updated_at BEFORE UPDATE ON public.assessor_nudges FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: admin_cost_settings audit_sensitive_write; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_sensitive_write AFTER INSERT OR DELETE OR UPDATE ON public.admin_cost_settings FOR EACH ROW EXECUTE FUNCTION public.audit_sensitive_write();


--
-- Name: ai_model_rates audit_sensitive_write; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_sensitive_write AFTER INSERT OR DELETE OR UPDATE ON public.ai_model_rates FOR EACH ROW EXECUTE FUNCTION public.audit_sensitive_write();


--
-- Name: app_user_connection_aliases audit_sensitive_write; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_sensitive_write AFTER INSERT OR DELETE OR UPDATE ON public.app_user_connection_aliases FOR EACH ROW EXECUTE FUNCTION public.audit_sensitive_write();


--
-- Name: app_user_connections audit_sensitive_write; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_sensitive_write AFTER INSERT OR DELETE OR UPDATE ON public.app_user_connections FOR EACH ROW EXECUTE FUNCTION public.audit_sensitive_write();


--
-- Name: calendar_connections audit_sensitive_write; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_sensitive_write AFTER INSERT OR DELETE OR UPDATE ON public.calendar_connections FOR EACH ROW EXECUTE FUNCTION public.audit_sensitive_write();


--
-- Name: dashboard_login_tokens audit_sensitive_write; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_sensitive_write AFTER INSERT OR DELETE OR UPDATE ON public.dashboard_login_tokens FOR EACH ROW EXECUTE FUNCTION public.audit_sensitive_write();


--
-- Name: support_sessions audit_sensitive_write; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_sensitive_write AFTER INSERT OR DELETE OR UPDATE ON public.support_sessions FOR EACH ROW EXECUTE FUNCTION public.audit_sensitive_write();


--
-- Name: telegram_link_tokens audit_sensitive_write; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_sensitive_write AFTER INSERT OR DELETE OR UPDATE ON public.telegram_link_tokens FOR EACH ROW EXECUTE FUNCTION public.audit_sensitive_write();


--
-- Name: whatsapp_link_codes audit_sensitive_write; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_sensitive_write AFTER INSERT OR DELETE OR UPDATE ON public.whatsapp_link_codes FOR EACH ROW EXECUTE FUNCTION public.audit_sensitive_write();


--
-- Name: whatsapp_template_rates audit_sensitive_write; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_sensitive_write AFTER INSERT OR DELETE OR UPDATE ON public.whatsapp_template_rates FOR EACH ROW EXECUTE FUNCTION public.audit_sensitive_write();


--
-- Name: autonomy_rules autonomy_rules_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER autonomy_rules_set_updated_at BEFORE UPDATE ON public.autonomy_rules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: calendar_event_links cal_links_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER cal_links_set_updated_at BEFORE UPDATE ON public.calendar_event_links FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: calendar_sync_state cal_sync_state_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER cal_sync_state_set_updated_at BEFORE UPDATE ON public.calendar_sync_state FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: calendar_connections calendar_connections_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER calendar_connections_touch BEFORE UPDATE ON public.calendar_connections FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: consultant_preferences consultant_preferences_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER consultant_preferences_set_updated_at BEFORE UPDATE ON public.consultant_preferences FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: consultant_preferences consultant_preferences_track_opt_ins; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER consultant_preferences_track_opt_ins BEFORE INSERT OR UPDATE ON public.consultant_preferences FOR EACH ROW EXECUTE FUNCTION public.consultant_preferences_track_opt_ins();


--
-- Name: conversation_states conversation_states_biu; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER conversation_states_biu BEFORE INSERT OR UPDATE ON public.conversation_states FOR EACH ROW EXECUTE FUNCTION public.conversation_states_touch();


--
-- Name: daily_digests daily_digests_biu; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER daily_digests_biu BEFORE INSERT OR UPDATE ON public.daily_digests FOR EACH ROW EXECUTE FUNCTION public.daily_digests_validate();


--
-- Name: daily_priorities daily_priorities_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER daily_priorities_set_updated_at BEFORE UPDATE ON public.daily_priorities FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: dashboard_announcements dashboard_announcements_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER dashboard_announcements_touch BEFORE UPDATE ON public.dashboard_announcements FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: deal_deadlines deal_deadlines_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER deal_deadlines_set_updated_at BEFORE UPDATE ON public.deal_deadlines FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: email_connections email_connections_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER email_connections_touch BEFORE UPDATE ON public.email_connections FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: email_drafts email_drafts_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER email_drafts_touch BEFORE UPDATE ON public.email_drafts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: email_drafts email_drafts_validate_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER email_drafts_validate_trg BEFORE INSERT OR UPDATE ON public.email_drafts FOR EACH ROW EXECUTE FUNCTION public.email_drafts_validate();


--
-- Name: email_messages email_messages_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER email_messages_touch BEFORE UPDATE ON public.email_messages FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: email_threads email_threads_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER email_threads_touch BEFORE UPDATE ON public.email_threads FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: event_categories event_categories_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER event_categories_touch BEFORE UPDATE ON public.event_categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: file_categories file_categories_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER file_categories_touch BEFORE UPDATE ON public.file_categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: folders folders_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER folders_touch BEFORE UPDATE ON public.folders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: follow_ups follow_ups_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER follow_ups_set_updated_at BEFORE UPDATE ON public.follow_ups FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: invite_send_attempts invite_send_attempts_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER invite_send_attempts_touch BEFORE UPDATE ON public.invite_send_attempts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: miscellaneous_items miscellaneous_items_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER miscellaneous_items_set_updated_at BEFORE UPDATE ON public.miscellaneous_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: financial_movements movements_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER movements_set_updated_at BEFORE UPDATE ON public.financial_movements FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: opportunities opportunities_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER opportunities_set_updated_at BEFORE UPDATE ON public.opportunities FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: pending_actions pending_actions_biu; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER pending_actions_biu BEFORE INSERT OR UPDATE ON public.pending_actions FOR EACH ROW EXECUTE FUNCTION public.pending_actions_validate();


--
-- Name: people people_email_norm_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER people_email_norm_trg BEFORE INSERT OR UPDATE OF email ON public.people FOR EACH ROW EXECUTE FUNCTION public.people_touch_email_norm();


--
-- Name: people people_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER people_set_updated_at BEFORE UPDATE ON public.people FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: pilot_invite_deliveries pilot_invite_deliveries_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER pilot_invite_deliveries_set_updated_at BEFORE UPDATE ON public.pilot_invite_deliveries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: pilot_participants pilot_participants_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER pilot_participants_guard BEFORE INSERT OR UPDATE ON public.pilot_participants FOR EACH ROW EXECUTE FUNCTION public.pilot_participants_guard();


--
-- Name: product_feedback product_feedback_biu; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER product_feedback_biu BEFORE INSERT OR UPDATE ON public.product_feedback FOR EACH ROW EXECUTE FUNCTION public.product_feedback_validate();


--
-- Name: product_updates product_updates_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER product_updates_touch BEFORE UPDATE ON public.product_updates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: product_updates product_updates_validate_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER product_updates_validate_trg BEFORE INSERT OR UPDATE ON public.product_updates FOR EACH ROW EXECUTE FUNCTION public.product_updates_validate();


--
-- Name: profiles profiles_account_access_new; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER profiles_account_access_new AFTER INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.account_access_on_new_profile();


--
-- Name: profiles profiles_restrict_self_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER profiles_restrict_self_update BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.profiles_restrict_self_update();


--
-- Name: profiles profiles_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: profiles profiles_validate_billing; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER profiles_validate_billing BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.profiles_validate_billing();


--
-- Name: promo_codes promo_codes_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER promo_codes_touch BEFORE UPDATE ON public.promo_codes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: promo_redemptions promo_redemptions_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER promo_redemptions_touch BEFORE UPDATE ON public.promo_redemptions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: properties properties_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER properties_set_updated_at BEFORE UPDATE ON public.properties FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: property_categories property_categories_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER property_categories_touch BEFORE UPDATE ON public.property_categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: property_interests property_interests_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER property_interests_touch BEFORE UPDATE ON public.property_interests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: property_marketing_activities property_marketing_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER property_marketing_touch BEFORE UPDATE ON public.property_marketing_activities FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: property_offers property_offers_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER property_offers_touch BEFORE UPDATE ON public.property_offers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: prospecting_leads prospecting_leads_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER prospecting_leads_set_updated_at BEFORE UPDATE ON public.prospecting_leads FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: reminders reminders_sync_follow_up_id_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER reminders_sync_follow_up_id_trg BEFORE INSERT OR UPDATE OF related_resource_type, related_resource_id ON public.reminders FOR EACH ROW EXECUTE FUNCTION public.reminders_sync_follow_up_id();


--
-- Name: reminders reminders_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER reminders_touch_updated_at BEFORE UPDATE ON public.reminders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: routines routines_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER routines_set_updated_at BEFORE UPDATE ON public.routines FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: subscription_events subscription_events_validate_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER subscription_events_validate_trg BEFORE INSERT OR UPDATE ON public.subscription_events FOR EACH ROW EXECUTE FUNCTION public.subscription_events_validate();


--
-- Name: tags tags_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tags_touch BEFORE UPDATE ON public.tags FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: content_access_consents trg_cac_validate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_cac_validate BEFORE INSERT OR UPDATE ON public.content_access_consents FOR EACH ROW EXECUTE FUNCTION public.content_access_consents_validate();


--
-- Name: assistant_user_corrections trg_corrections_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_corrections_updated BEFORE UPDATE ON public.assistant_user_corrections FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: assistant_golden_conversations trg_golden_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_golden_updated BEFORE UPDATE ON public.assistant_golden_conversations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: plan_configs trg_plan_configs_validate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_plan_configs_validate BEFORE INSERT OR UPDATE ON public.plan_configs FOR EACH ROW EXECUTE FUNCTION public.plan_configs_validate();


--
-- Name: uploaded_files uploaded_files_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER uploaded_files_set_updated_at BEFORE UPDATE ON public.uploaded_files FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: whatsapp_proactive_tests whatsapp_proactive_tests_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER whatsapp_proactive_tests_touch BEFORE UPDATE ON public.whatsapp_proactive_tests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: whatsapp_template_bindings whatsapp_template_bindings_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER whatsapp_template_bindings_touch BEFORE UPDATE ON public.whatsapp_template_bindings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: whatsapp_template_rates whatsapp_template_rates_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER whatsapp_template_rates_touch BEFORE UPDATE ON public.whatsapp_template_rates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: access_invites access_invites_pilot_key_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_invites
    ADD CONSTRAINT access_invites_pilot_key_fkey FOREIGN KEY (pilot_key) REFERENCES public.pilots(key);


--
-- Name: admin_audit_logs admin_audit_logs_admin_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_audit_logs
    ADD CONSTRAINT admin_audit_logs_admin_user_id_fkey FOREIGN KEY (admin_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: admin_audit_logs admin_audit_logs_target_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_audit_logs
    ADD CONSTRAINT admin_audit_logs_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: admin_broadcast_recipients admin_broadcast_recipients_broadcast_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_broadcast_recipients
    ADD CONSTRAINT admin_broadcast_recipients_broadcast_id_fkey FOREIGN KEY (broadcast_id) REFERENCES public.admin_broadcasts(id) ON DELETE CASCADE;


--
-- Name: admin_broadcast_recipients admin_broadcast_recipients_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_broadcast_recipients
    ADD CONSTRAINT admin_broadcast_recipients_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: admin_messages admin_messages_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_messages
    ADD CONSTRAINT admin_messages_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: admin_messages admin_messages_consultor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_messages
    ADD CONSTRAINT admin_messages_consultor_id_fkey FOREIGN KEY (consultor_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: admin_mfa_required admin_mfa_required_required_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_mfa_required
    ADD CONSTRAINT admin_mfa_required_required_by_fkey FOREIGN KEY (required_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: admin_mfa_required admin_mfa_required_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_mfa_required
    ADD CONSTRAINT admin_mfa_required_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: announcement_dismissals announcement_dismissals_announcement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcement_dismissals
    ADD CONSTRAINT announcement_dismissals_announcement_id_fkey FOREIGN KEY (announcement_id) REFERENCES public.dashboard_announcements(id) ON DELETE CASCADE;


--
-- Name: announcement_dismissals announcement_dismissals_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcement_dismissals
    ADD CONSTRAINT announcement_dismissals_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: app_user_connection_aliases app_user_connection_aliases_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_user_connection_aliases
    ADD CONSTRAINT app_user_connection_aliases_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: app_user_connections app_user_connections_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_user_connections
    ADD CONSTRAINT app_user_connections_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: assessor_ai_logs assessor_ai_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessor_ai_logs
    ADD CONSTRAINT assessor_ai_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;


--
-- Name: assessor_messages assessor_messages_related_pending_action_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessor_messages
    ADD CONSTRAINT assessor_messages_related_pending_action_id_fkey FOREIGN KEY (related_pending_action_id) REFERENCES public.pending_actions(id) ON DELETE SET NULL;


--
-- Name: assessor_messages assessor_messages_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessor_messages
    ADD CONSTRAINT assessor_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: assessor_nudges assessor_nudges_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessor_nudges
    ADD CONSTRAINT assessor_nudges_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: assessor_quality_scores assessor_quality_scores_trace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessor_quality_scores
    ADD CONSTRAINT assessor_quality_scores_trace_id_fkey FOREIGN KEY (trace_id) REFERENCES public.assessor_reasoning_traces(id) ON DELETE SET NULL;


--
-- Name: assessor_quality_scores assessor_quality_scores_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessor_quality_scores
    ADD CONSTRAINT assessor_quality_scores_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: assessor_reasoning_traces assessor_reasoning_traces_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessor_reasoning_traces
    ADD CONSTRAINT assessor_reasoning_traces_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: assessor_tool_calls assessor_tool_calls_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessor_tool_calls
    ADD CONSTRAINT assessor_tool_calls_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: assistant_golden_runs assistant_golden_runs_golden_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assistant_golden_runs
    ADD CONSTRAINT assistant_golden_runs_golden_id_fkey FOREIGN KEY (golden_id) REFERENCES public.assistant_golden_conversations(id) ON DELETE CASCADE;


--
-- Name: assistant_reflections assistant_reflections_correction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assistant_reflections
    ADD CONSTRAINT assistant_reflections_correction_id_fkey FOREIGN KEY (correction_id) REFERENCES public.assistant_user_corrections(id) ON DELETE SET NULL;


--
-- Name: assistant_reflections assistant_reflections_trace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assistant_reflections
    ADD CONSTRAINT assistant_reflections_trace_id_fkey FOREIGN KEY (trace_id) REFERENCES public.assessor_reasoning_traces(id) ON DELETE CASCADE;


--
-- Name: assistant_reflections assistant_reflections_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assistant_reflections
    ADD CONSTRAINT assistant_reflections_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: assistant_shadow_runs assistant_shadow_runs_trace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assistant_shadow_runs
    ADD CONSTRAINT assistant_shadow_runs_trace_id_fkey FOREIGN KEY (trace_id) REFERENCES public.assessor_reasoning_traces(id) ON DELETE CASCADE;


--
-- Name: assistant_shadow_runs assistant_shadow_runs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assistant_shadow_runs
    ADD CONSTRAINT assistant_shadow_runs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: assistant_trust_scores assistant_trust_scores_trace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assistant_trust_scores
    ADD CONSTRAINT assistant_trust_scores_trace_id_fkey FOREIGN KEY (trace_id) REFERENCES public.assessor_reasoning_traces(id) ON DELETE CASCADE;


--
-- Name: assistant_trust_scores assistant_trust_scores_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assistant_trust_scores
    ADD CONSTRAINT assistant_trust_scores_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: assistant_user_corrections assistant_user_corrections_turn_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assistant_user_corrections
    ADD CONSTRAINT assistant_user_corrections_turn_id_fkey FOREIGN KEY (turn_id) REFERENCES public.assessor_reasoning_traces(id) ON DELETE SET NULL;


--
-- Name: assistant_user_corrections assistant_user_corrections_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assistant_user_corrections
    ADD CONSTRAINT assistant_user_corrections_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: autonomy_rules autonomy_rules_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.autonomy_rules
    ADD CONSTRAINT autonomy_rules_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: calendar_connections calendar_connections_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_connections
    ADD CONSTRAINT calendar_connections_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: calendar_event_links calendar_event_links_follow_up_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_event_links
    ADD CONSTRAINT calendar_event_links_follow_up_id_fkey FOREIGN KEY (follow_up_id) REFERENCES public.follow_ups(id) ON DELETE CASCADE;


--
-- Name: calendar_event_links calendar_event_links_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_event_links
    ADD CONSTRAINT calendar_event_links_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: calendar_sync_log calendar_sync_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_sync_log
    ADD CONSTRAINT calendar_sync_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: calendar_sync_state calendar_sync_state_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_sync_state
    ADD CONSTRAINT calendar_sync_state_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: channel_links channel_links_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_links
    ADD CONSTRAINT channel_links_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: consultant_preferences consultant_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consultant_preferences
    ADD CONSTRAINT consultant_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: content_access_consents content_access_consents_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_access_consents
    ADD CONSTRAINT content_access_consents_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: conversation_locks conversation_locks_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_locks
    ADD CONSTRAINT conversation_locks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;


--
-- Name: conversation_states conversation_states_active_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_states
    ADD CONSTRAINT conversation_states_active_person_id_fkey FOREIGN KEY (active_person_id) REFERENCES public.people(id) ON DELETE SET NULL;


--
-- Name: conversation_states conversation_states_last_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_states
    ADD CONSTRAINT conversation_states_last_property_id_fkey FOREIGN KEY (last_property_id) REFERENCES public.properties(id) ON DELETE SET NULL;


--
-- Name: conversation_states conversation_states_pending_action_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_states
    ADD CONSTRAINT conversation_states_pending_action_id_fkey FOREIGN KEY (pending_action_id) REFERENCES public.pending_actions(id) ON DELETE SET NULL;


--
-- Name: conversation_states conversation_states_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_states
    ADD CONSTRAINT conversation_states_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: daily_digests daily_digests_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_digests
    ADD CONSTRAINT daily_digests_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: daily_digests daily_digests_broadcast_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_digests
    ADD CONSTRAINT daily_digests_broadcast_id_fkey FOREIGN KEY (broadcast_id) REFERENCES public.admin_broadcasts(id) ON DELETE SET NULL;


--
-- Name: daily_priorities daily_priorities_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_priorities
    ADD CONSTRAINT daily_priorities_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: dashboard_login_tokens dashboard_login_tokens_issued_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dashboard_login_tokens
    ADD CONSTRAINT dashboard_login_tokens_issued_by_fkey FOREIGN KEY (issued_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: dashboard_login_tokens dashboard_login_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dashboard_login_tokens
    ADD CONSTRAINT dashboard_login_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: deal_deadlines deal_deadlines_opportunity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_deadlines
    ADD CONSTRAINT deal_deadlines_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES public.opportunities(id) ON DELETE CASCADE;


--
-- Name: deal_deadlines deal_deadlines_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_deadlines
    ADD CONSTRAINT deal_deadlines_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: email_connections email_connections_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_connections
    ADD CONSTRAINT email_connections_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: email_drafts email_drafts_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_drafts
    ADD CONSTRAINT email_drafts_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.people(id) ON DELETE SET NULL;


--
-- Name: email_drafts email_drafts_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_drafts
    ADD CONSTRAINT email_drafts_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.email_threads(id) ON DELETE CASCADE;


--
-- Name: email_drafts email_drafts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_drafts
    ADD CONSTRAINT email_drafts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: email_messages email_messages_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_messages
    ADD CONSTRAINT email_messages_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.email_threads(id) ON DELETE CASCADE;


--
-- Name: email_messages email_messages_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_messages
    ADD CONSTRAINT email_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: email_threads email_threads_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_threads
    ADD CONSTRAINT email_threads_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.people(id) ON DELETE SET NULL;


--
-- Name: email_threads email_threads_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_threads
    ADD CONSTRAINT email_threads_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: entity_tags entity_tags_tag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_tags
    ADD CONSTRAINT entity_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON DELETE CASCADE;


--
-- Name: entity_tags entity_tags_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_tags
    ADD CONSTRAINT entity_tags_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: event_categories event_categories_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_categories
    ADD CONSTRAINT event_categories_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: feature_flag_users feature_flag_users_flag_key_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feature_flag_users
    ADD CONSTRAINT feature_flag_users_flag_key_fkey FOREIGN KEY (flag_key) REFERENCES public.feature_flags(key) ON DELETE CASCADE;


--
-- Name: feature_flag_users feature_flag_users_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feature_flag_users
    ADD CONSTRAINT feature_flag_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: feature_flags feature_flags_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feature_flags
    ADD CONSTRAINT feature_flags_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: file_categories file_categories_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_categories
    ADD CONSTRAINT file_categories_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: file_links file_links_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_links
    ADD CONSTRAINT file_links_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.uploaded_files(id) ON DELETE CASCADE;


--
-- Name: file_links file_links_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_links
    ADD CONSTRAINT file_links_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: financial_movements financial_movements_opportunity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_movements
    ADD CONSTRAINT financial_movements_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES public.opportunities(id) ON DELETE SET NULL;


--
-- Name: financial_movements financial_movements_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_movements
    ADD CONSTRAINT financial_movements_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE SET NULL;


--
-- Name: financial_movements financial_movements_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_movements
    ADD CONSTRAINT financial_movements_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: folder_items folder_items_folder_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folder_items
    ADD CONSTRAINT folder_items_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.folders(id) ON DELETE CASCADE;


--
-- Name: folder_items folder_items_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folder_items
    ADD CONSTRAINT folder_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: folders folders_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folders
    ADD CONSTRAINT folders_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: follow_ups follow_ups_event_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follow_ups
    ADD CONSTRAINT follow_ups_event_category_id_fkey FOREIGN KEY (event_category_id) REFERENCES public.event_categories(id) ON DELETE SET NULL;


--
-- Name: follow_ups follow_ups_opportunity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follow_ups
    ADD CONSTRAINT follow_ups_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES public.opportunities(id) ON DELETE SET NULL;


--
-- Name: follow_ups follow_ups_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follow_ups
    ADD CONSTRAINT follow_ups_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.people(id) ON DELETE SET NULL;


--
-- Name: follow_ups follow_ups_related_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follow_ups
    ADD CONSTRAINT follow_ups_related_file_id_fkey FOREIGN KEY (related_file_id) REFERENCES public.uploaded_files(id) ON DELETE SET NULL;


--
-- Name: follow_ups follow_ups_related_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follow_ups
    ADD CONSTRAINT follow_ups_related_property_id_fkey FOREIGN KEY (related_property_id) REFERENCES public.properties(id) ON DELETE SET NULL;


--
-- Name: follow_ups follow_ups_related_prospecting_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follow_ups
    ADD CONSTRAINT follow_ups_related_prospecting_lead_id_fkey FOREIGN KEY (related_prospecting_lead_id) REFERENCES public.prospecting_leads(id) ON DELETE SET NULL;


--
-- Name: follow_ups follow_ups_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follow_ups
    ADD CONSTRAINT follow_ups_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: interactions interactions_opportunity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interactions
    ADD CONSTRAINT interactions_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES public.opportunities(id) ON DELETE SET NULL;


--
-- Name: interactions interactions_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interactions
    ADD CONSTRAINT interactions_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.people(id) ON DELETE SET NULL;


--
-- Name: interactions interactions_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interactions
    ADD CONSTRAINT interactions_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: interactions interactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interactions
    ADD CONSTRAINT interactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: invite_send_attempts invite_send_attempts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invite_send_attempts
    ADD CONSTRAINT invite_send_attempts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: miscellaneous_items miscellaneous_items_related_opportunity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.miscellaneous_items
    ADD CONSTRAINT miscellaneous_items_related_opportunity_id_fkey FOREIGN KEY (related_opportunity_id) REFERENCES public.opportunities(id) ON DELETE SET NULL;


--
-- Name: miscellaneous_items miscellaneous_items_related_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.miscellaneous_items
    ADD CONSTRAINT miscellaneous_items_related_person_id_fkey FOREIGN KEY (related_person_id) REFERENCES public.people(id) ON DELETE SET NULL;


--
-- Name: miscellaneous_items miscellaneous_items_related_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.miscellaneous_items
    ADD CONSTRAINT miscellaneous_items_related_property_id_fkey FOREIGN KEY (related_property_id) REFERENCES public.properties(id) ON DELETE SET NULL;


--
-- Name: miscellaneous_items miscellaneous_items_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.miscellaneous_items
    ADD CONSTRAINT miscellaneous_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: opportunities opportunities_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opportunities
    ADD CONSTRAINT opportunities_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.people(id) ON DELETE SET NULL;


--
-- Name: opportunities opportunities_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opportunities
    ADD CONSTRAINT opportunities_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE SET NULL;


--
-- Name: opportunities opportunities_source_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opportunities
    ADD CONSTRAINT opportunities_source_lead_id_fkey FOREIGN KEY (source_lead_id) REFERENCES public.prospecting_leads(id) ON DELETE SET NULL;


--
-- Name: opportunities opportunities_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opportunities
    ADD CONSTRAINT opportunities_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: opportunity_events opportunity_events_opportunity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opportunity_events
    ADD CONSTRAINT opportunity_events_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES public.opportunities(id) ON DELETE CASCADE;


--
-- Name: opportunity_events opportunity_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opportunity_events
    ADD CONSTRAINT opportunity_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: opportunity_properties opportunity_properties_opportunity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opportunity_properties
    ADD CONSTRAINT opportunity_properties_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES public.opportunities(id) ON DELETE CASCADE;


--
-- Name: opportunity_properties opportunity_properties_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opportunity_properties
    ADD CONSTRAINT opportunity_properties_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: opportunity_properties opportunity_properties_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opportunity_properties
    ADD CONSTRAINT opportunity_properties_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: pending_actions pending_actions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_actions
    ADD CONSTRAINT pending_actions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: people people_referred_by_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.people
    ADD CONSTRAINT people_referred_by_person_id_fkey FOREIGN KEY (referred_by_person_id) REFERENCES public.people(id) ON DELETE SET NULL;


--
-- Name: people people_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.people
    ADD CONSTRAINT people_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: person_phones person_phones_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.person_phones
    ADD CONSTRAINT person_phones_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.people(id) ON DELETE CASCADE;


--
-- Name: person_phones person_phones_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.person_phones
    ADD CONSTRAINT person_phones_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: pilot_invite_deliveries pilot_invite_deliveries_pilot_key_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pilot_invite_deliveries
    ADD CONSTRAINT pilot_invite_deliveries_pilot_key_fkey FOREIGN KEY (pilot_key) REFERENCES public.pilots(key);


--
-- Name: pilot_participants pilot_participants_pilot_key_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pilot_participants
    ADD CONSTRAINT pilot_participants_pilot_key_fkey FOREIGN KEY (pilot_key) REFERENCES public.pilots(key);


--
-- Name: product_feedback product_feedback_attachment_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_feedback
    ADD CONSTRAINT product_feedback_attachment_file_id_fkey FOREIGN KEY (attachment_file_id) REFERENCES public.uploaded_files(id) ON DELETE SET NULL;


--
-- Name: product_feedback product_feedback_handled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_feedback
    ADD CONSTRAINT product_feedback_handled_by_fkey FOREIGN KEY (handled_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: product_feedback product_feedback_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_feedback
    ADD CONSTRAINT product_feedback_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: product_telemetry_events product_telemetry_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_telemetry_events
    ADD CONSTRAINT product_telemetry_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: promo_redemptions promo_redemptions_code_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promo_redemptions
    ADD CONSTRAINT promo_redemptions_code_id_fkey FOREIGN KEY (code_id) REFERENCES public.promo_codes(id) ON DELETE CASCADE;


--
-- Name: promo_redemptions promo_redemptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promo_redemptions
    ADD CONSTRAINT promo_redemptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: properties properties_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.properties
    ADD CONSTRAINT properties_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.property_categories(id) ON DELETE SET NULL;


--
-- Name: properties properties_owner_person_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.properties
    ADD CONSTRAINT properties_owner_person_fk FOREIGN KEY (owner_person_id) REFERENCES public.people(id) ON DELETE SET NULL;


--
-- Name: properties properties_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.properties
    ADD CONSTRAINT properties_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: property_categories property_categories_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_categories
    ADD CONSTRAINT property_categories_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;


--
-- Name: property_interests property_interests_opportunity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_interests
    ADD CONSTRAINT property_interests_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES public.opportunities(id) ON DELETE SET NULL;


--
-- Name: property_interests property_interests_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_interests
    ADD CONSTRAINT property_interests_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.people(id) ON DELETE SET NULL;


--
-- Name: property_interests property_interests_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_interests
    ADD CONSTRAINT property_interests_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: property_interests property_interests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_interests
    ADD CONSTRAINT property_interests_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: property_marketing_activities property_marketing_activities_opportunity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_marketing_activities
    ADD CONSTRAINT property_marketing_activities_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES public.opportunities(id) ON DELETE SET NULL;


--
-- Name: property_marketing_activities property_marketing_activities_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_marketing_activities
    ADD CONSTRAINT property_marketing_activities_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: property_marketing_activities property_marketing_activities_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_marketing_activities
    ADD CONSTRAINT property_marketing_activities_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: property_offers property_offers_opportunity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_offers
    ADD CONSTRAINT property_offers_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES public.opportunities(id) ON DELETE SET NULL;


--
-- Name: property_offers property_offers_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_offers
    ADD CONSTRAINT property_offers_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.people(id) ON DELETE SET NULL;


--
-- Name: property_offers property_offers_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_offers
    ADD CONSTRAINT property_offers_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- Name: property_offers property_offers_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_offers
    ADD CONSTRAINT property_offers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: prospecting_leads prospecting_leads_image_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prospecting_leads
    ADD CONSTRAINT prospecting_leads_image_file_id_fkey FOREIGN KEY (image_file_id) REFERENCES public.uploaded_files(id) ON DELETE SET NULL;


--
-- Name: prospecting_leads prospecting_leads_related_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prospecting_leads
    ADD CONSTRAINT prospecting_leads_related_person_id_fkey FOREIGN KEY (related_person_id) REFERENCES public.people(id) ON DELETE SET NULL;


--
-- Name: prospecting_leads prospecting_leads_related_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prospecting_leads
    ADD CONSTRAINT prospecting_leads_related_property_id_fkey FOREIGN KEY (related_property_id) REFERENCES public.properties(id) ON DELETE SET NULL;


--
-- Name: prospecting_leads prospecting_leads_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prospecting_leads
    ADD CONSTRAINT prospecting_leads_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: reminders reminders_follow_up_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminders
    ADD CONSTRAINT reminders_follow_up_id_fkey FOREIGN KEY (follow_up_id) REFERENCES public.follow_ups(id) ON DELETE CASCADE;


--
-- Name: reminders reminders_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminders
    ADD CONSTRAINT reminders_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: routines routines_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routines
    ADD CONSTRAINT routines_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: short_links short_links_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.short_links
    ADD CONSTRAINT short_links_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: similar_listing_searches similar_listing_searches_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.similar_listing_searches
    ADD CONSTRAINT similar_listing_searches_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: stripe_webhook_events stripe_webhook_events_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stripe_webhook_events
    ADD CONSTRAINT stripe_webhook_events_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: subscription_events subscription_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_events
    ADD CONSTRAINT subscription_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: support_sessions support_sessions_admin_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_sessions
    ADD CONSTRAINT support_sessions_admin_user_id_fkey FOREIGN KEY (admin_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: support_sessions support_sessions_target_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_sessions
    ADD CONSTRAINT support_sessions_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: tags tags_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: telegram_invites telegram_invites_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_invites
    ADD CONSTRAINT telegram_invites_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: telegram_invites telegram_invites_used_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_invites
    ADD CONSTRAINT telegram_invites_used_by_fkey FOREIGN KEY (used_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: telegram_link_tokens telegram_link_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_link_tokens
    ADD CONSTRAINT telegram_link_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: telegram_pairings telegram_pairings_target_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_pairings
    ADD CONSTRAINT telegram_pairings_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: uploaded_files uploaded_files_custom_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uploaded_files
    ADD CONSTRAINT uploaded_files_custom_category_id_fkey FOREIGN KEY (custom_category_id) REFERENCES public.file_categories(id) ON DELETE SET NULL;


--
-- Name: uploaded_files uploaded_files_duplicate_of_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uploaded_files
    ADD CONSTRAINT uploaded_files_duplicate_of_fkey FOREIGN KEY (duplicate_of) REFERENCES public.uploaded_files(id) ON DELETE SET NULL;


--
-- Name: uploaded_files uploaded_files_opportunity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uploaded_files
    ADD CONSTRAINT uploaded_files_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES public.opportunities(id) ON DELETE SET NULL;


--
-- Name: uploaded_files uploaded_files_related_pending_action_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uploaded_files
    ADD CONSTRAINT uploaded_files_related_pending_action_id_fkey FOREIGN KEY (related_pending_action_id) REFERENCES public.pending_actions(id) ON DELETE SET NULL;


--
-- Name: uploaded_files uploaded_files_source_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uploaded_files
    ADD CONSTRAINT uploaded_files_source_message_id_fkey FOREIGN KEY (source_message_id) REFERENCES public.assessor_messages(id) ON DELETE SET NULL;


--
-- Name: uploaded_files uploaded_files_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uploaded_files
    ADD CONSTRAINT uploaded_files_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: whatsapp_link_codes whatsapp_link_codes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_link_codes
    ADD CONSTRAINT whatsapp_link_codes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: whatsapp_proactive_tests whatsapp_proactive_tests_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_proactive_tests
    ADD CONSTRAINT whatsapp_proactive_tests_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: whatsapp_proactive_tests whatsapp_proactive_tests_send_log_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_proactive_tests
    ADD CONSTRAINT whatsapp_proactive_tests_send_log_id_fkey FOREIGN KEY (send_log_id) REFERENCES public.whatsapp_send_logs(id) ON DELETE SET NULL;


--
-- Name: whatsapp_proactive_tests whatsapp_proactive_tests_target_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_proactive_tests
    ADD CONSTRAINT whatsapp_proactive_tests_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: whatsapp_send_logs whatsapp_send_logs_triggered_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_send_logs
    ADD CONSTRAINT whatsapp_send_logs_triggered_by_fkey FOREIGN KEY (triggered_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: whatsapp_template_bindings whatsapp_template_bindings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_template_bindings
    ADD CONSTRAINT whatsapp_template_bindings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: whatsapp_template_rates whatsapp_template_rates_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_template_rates
    ADD CONSTRAINT whatsapp_template_rates_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: assessor_ai_logs Admins can read AI logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can read AI logs" ON public.assessor_ai_logs FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));


--
-- Name: inbound_message_claims Admins can read inbound claims; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can read inbound claims" ON public.inbound_message_claims FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));


--
-- Name: pilot_invite_deliveries Admins can read pilot invite deliveries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can read pilot invite deliveries" ON public.pilot_invite_deliveries FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));


--
-- Name: admin_broadcasts Admins can view broadcasts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view broadcasts" ON public.admin_broadcasts FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));


--
-- Name: promo_codes Admins can view promo codes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view promo codes" ON public.promo_codes FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));


--
-- Name: content_access_consents Admins create consent requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins create consent requests" ON public.content_access_consents FOR INSERT TO authenticated WITH CHECK ((public.is_admin(auth.uid()) AND (requested_by = auth.uid())));


--
-- Name: user_roles Admins delete roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins delete roles" ON public.user_roles FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));


--
-- Name: user_roles Admins insert roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins insert roles" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));


--
-- Name: plan_configs Admins manage plan configs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage plan configs" ON public.plan_configs TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));


--
-- Name: stripe_webhook_events Admins podem ver eventos de pagamento; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins podem ver eventos de pagamento" ON public.stripe_webhook_events FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));


--
-- Name: user_roles Admins read all roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins read all roles" ON public.user_roles FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));


--
-- Name: admin_audit_logs Admins read audit; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins read audit" ON public.admin_audit_logs FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));


--
-- Name: feature_flags Admins read flags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins read flags" ON public.feature_flags FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));


--
-- Name: admin_mfa_required Admins read mfa flags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins read mfa flags" ON public.admin_mfa_required FOR SELECT TO authenticated USING ((public.is_admin(auth.uid()) OR (auth.uid() = user_id)));


--
-- Name: whatsapp_template_bindings Admins read template bindings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins read template bindings" ON public.whatsapp_template_bindings FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));


--
-- Name: user_roles Admins update roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins update roles" ON public.user_roles FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));


--
-- Name: dashboard_announcements Authenticated can read active announcements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can read active announcements" ON public.dashboard_announcements FOR SELECT TO authenticated USING (((active = true) AND ((expires_at IS NULL) OR (expires_at > now()))));


--
-- Name: content_access_consents Consultant decides own consent requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Consultant decides own consent requests" ON public.content_access_consents FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: content_access_consents Consultant sees own consent requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Consultant sees own consent requests" ON public.content_access_consents FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.is_admin(auth.uid())));


--
-- Name: file_categories Consultor gere as suas categorias; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Consultor gere as suas categorias" ON public.file_categories TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: property_categories Consultor gere as suas categorias de imoveis; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Consultor gere as suas categorias de imoveis" ON public.property_categories TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: announcement_dismissals Consultor gere os seus avisos fechados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Consultor gere os seus avisos fechados" ON public.announcement_dismissals TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: proactive_daily_ledger Consultor vê as suas vagas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Consultor vê as suas vagas" ON public.proactive_daily_ledger FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: similar_listing_searches Consultores registam as suas pesquisas de mercado; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Consultores registam as suas pesquisas de mercado" ON public.similar_listing_searches FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: similar_listing_searches Consultores veem as suas pesquisas de mercado; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Consultores veem as suas pesquisas de mercado" ON public.similar_listing_searches FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: plan_configs Published plans are readable by anyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Published plans are readable by anyone" ON public.plan_configs FOR SELECT USING ((status = 'published'::text));


--
-- Name: staging_notes Staging members read notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staging members read notes" ON public.staging_notes FOR SELECT TO authenticated USING (public.has_staging_access(auth.uid()));


--
-- Name: billing_test_accounts Super admins can read billing test accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admins can read billing test accounts" ON public.billing_test_accounts FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));


--
-- Name: feature_flag_users User reads own flag membership; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "User reads own flag membership" ON public.feature_flag_users FOR SELECT TO authenticated USING (((auth.uid() = user_id) OR public.is_admin(auth.uid())));


--
-- Name: event_categories Users manage own event categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own event categories" ON public.event_categories TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: miscellaneous_items Users manage own miscellaneous; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own miscellaneous" ON public.miscellaneous_items TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: deal_deadlines Users manage their own deal deadlines; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage their own deal deadlines" ON public.deal_deadlines TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: user_roles Users read own roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users read own roles" ON public.user_roles FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: access_invite_attempts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.access_invite_attempts ENABLE ROW LEVEL SECURITY;

--
-- Name: access_invites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.access_invites ENABLE ROW LEVEL SECURITY;

--
-- Name: access_waitlist; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.access_waitlist ENABLE ROW LEVEL SECURITY;

--
-- Name: account_access; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.account_access ENABLE ROW LEVEL SECURITY;

--
-- Name: access_invite_attempts admin attempts read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin attempts read" ON public.access_invite_attempts FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));


--
-- Name: access_invites admin invites read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin invites read" ON public.access_invites FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));


--
-- Name: pilots admin pilots read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin pilots read" ON public.pilots FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));


--
-- Name: admin_audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_broadcast_recipients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_broadcast_recipients ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_broadcasts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_broadcasts ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_cost_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_cost_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_mfa_required; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_mfa_required ENABLE ROW LEVEL SECURITY;

--
-- Name: invite_send_attempts admins gerem convites por reenviar; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins gerem convites por reenviar" ON public.invite_send_attempts TO authenticated USING ((public.has_role(auth.uid(), 'super_admin'::public.app_role) OR public.has_role(auth.uid(), 'support_admin'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'super_admin'::public.app_role) OR public.has_role(auth.uid(), 'support_admin'::public.app_role)));


--
-- Name: whatsapp_proactive_tests admins read whatsapp proactive tests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins read whatsapp proactive tests" ON public.whatsapp_proactive_tests FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));


--
-- Name: whatsapp_send_logs admins read whatsapp send logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins read whatsapp send logs" ON public.whatsapp_send_logs FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));


--
-- Name: whatsapp_template_rates admins read whatsapp template rates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins read whatsapp template rates" ON public.whatsapp_template_rates FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));


--
-- Name: admin_broadcast_recipients admins_read_broadcast_recipients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admins_read_broadcast_recipients ON public.admin_broadcast_recipients FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));


--
-- Name: ai_model_rates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_model_rates ENABLE ROW LEVEL SECURITY;

--
-- Name: alert_mutes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.alert_mutes ENABLE ROW LEVEL SECURITY;

--
-- Name: alert_mutes alert_mutes_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY alert_mutes_own ON public.alert_mutes TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: announcement_dismissals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.announcement_dismissals ENABLE ROW LEVEL SECURITY;

--
-- Name: app_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: app_settings app_settings_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY app_settings_admin_write ON public.app_settings TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));


--
-- Name: app_settings app_settings_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY app_settings_read ON public.app_settings FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));


--
-- Name: app_user_connection_aliases; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_user_connection_aliases ENABLE ROW LEVEL SECURITY;

--
-- Name: app_user_connections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_user_connections ENABLE ROW LEVEL SECURITY;

--
-- Name: assessor_ai_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assessor_ai_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: assessor_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assessor_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: assessor_nudges; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assessor_nudges ENABLE ROW LEVEL SECURITY;

--
-- Name: assessor_quality_scores; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assessor_quality_scores ENABLE ROW LEVEL SECURITY;

--
-- Name: assessor_reasoning_traces; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assessor_reasoning_traces ENABLE ROW LEVEL SECURITY;

--
-- Name: assessor_tool_calls; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assessor_tool_calls ENABLE ROW LEVEL SECURITY;

--
-- Name: assistant_golden_conversations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assistant_golden_conversations ENABLE ROW LEVEL SECURITY;

--
-- Name: assistant_golden_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assistant_golden_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: assistant_reflections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assistant_reflections ENABLE ROW LEVEL SECURITY;

--
-- Name: assistant_shadow_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assistant_shadow_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: assistant_trust_scores; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assistant_trust_scores ENABLE ROW LEVEL SECURITY;

--
-- Name: assistant_user_corrections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assistant_user_corrections ENABLE ROW LEVEL SECURITY;

--
-- Name: autonomy_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.autonomy_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: billing_test_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.billing_test_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: calendar_connections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calendar_connections ENABLE ROW LEVEL SECURITY;

--
-- Name: calendar_event_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calendar_event_links ENABLE ROW LEVEL SECURITY;

--
-- Name: calendar_sync_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calendar_sync_log ENABLE ROW LEVEL SECURITY;

--
-- Name: calendar_sync_state; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calendar_sync_state ENABLE ROW LEVEL SECURITY;

--
-- Name: channel_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.channel_links ENABLE ROW LEVEL SECURITY;

--
-- Name: channel_links channel_links_owner_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY channel_links_owner_select ON public.channel_links FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: consultant_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.consultant_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: content_access_consents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.content_access_consents ENABLE ROW LEVEL SECURITY;

--
-- Name: conversation_locks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversation_locks ENABLE ROW LEVEL SECURITY;

--
-- Name: conversation_locks conversation_locks_owner_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conversation_locks_owner_read ON public.conversation_locks FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: conversation_states; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversation_states ENABLE ROW LEVEL SECURITY;

--
-- Name: conversation_states conversation_states_owner_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY conversation_states_owner_all ON public.conversation_states TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: assistant_user_corrections corrections_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY corrections_admin_read ON public.assistant_user_corrections FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));


--
-- Name: daily_digests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.daily_digests ENABLE ROW LEVEL SECURITY;

--
-- Name: daily_digests daily_digests_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY daily_digests_admin_read ON public.daily_digests FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));


--
-- Name: daily_priorities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.daily_priorities ENABLE ROW LEVEL SECURITY;

--
-- Name: dashboard_announcements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dashboard_announcements ENABLE ROW LEVEL SECURITY;

--
-- Name: dashboard_login_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dashboard_login_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: deal_deadlines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.deal_deadlines ENABLE ROW LEVEL SECURITY;

--
-- Name: email_connections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_connections ENABLE ROW LEVEL SECURITY;

--
-- Name: email_connections email_connections_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY email_connections_own ON public.email_connections TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: email_drafts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_drafts ENABLE ROW LEVEL SECURITY;

--
-- Name: email_drafts email_drafts_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY email_drafts_own ON public.email_drafts TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: email_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: email_messages email_messages_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY email_messages_own ON public.email_messages TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: email_threads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_threads ENABLE ROW LEVEL SECURITY;

--
-- Name: email_threads email_threads_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY email_threads_own ON public.email_threads TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: entity_tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.entity_tags ENABLE ROW LEVEL SECURITY;

--
-- Name: entity_tags entity_tags_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY entity_tags_own ON public.entity_tags TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: event_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: feature_flag_users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.feature_flag_users ENABLE ROW LEVEL SECURITY;

--
-- Name: feature_flags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

--
-- Name: file_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.file_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: file_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.file_links ENABLE ROW LEVEL SECURITY;

--
-- Name: file_links file_links_owner_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY file_links_owner_all ON public.file_links TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: financial_movements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.financial_movements ENABLE ROW LEVEL SECURITY;

--
-- Name: folder_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.folder_items ENABLE ROW LEVEL SECURITY;

--
-- Name: folder_items folder_items_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY folder_items_own ON public.folder_items TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: folders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;

--
-- Name: folders folders_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY folders_own ON public.folders TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: follow_ups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;

--
-- Name: assistant_golden_conversations golden_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golden_admin_read ON public.assistant_golden_conversations FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));


--
-- Name: assistant_golden_runs golden_runs_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY golden_runs_admin_read ON public.assistant_golden_runs FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));


--
-- Name: inbound_message_claims; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inbound_message_claims ENABLE ROW LEVEL SECURITY;

--
-- Name: interactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.interactions ENABLE ROW LEVEL SECURITY;

--
-- Name: invite_send_attempts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invite_send_attempts ENABLE ROW LEVEL SECURITY;

--
-- Name: landing_page_visits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.landing_page_visits ENABLE ROW LEVEL SECURITY;

--
-- Name: landing_page_visits landing_page_visits_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY landing_page_visits_admin_read ON public.landing_page_visits FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));


--
-- Name: mentor_decisions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mentor_decisions ENABLE ROW LEVEL SECURITY;

--
-- Name: mentor_decisions mentor_decisions_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mentor_decisions_own ON public.mentor_decisions TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: miscellaneous_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.miscellaneous_items ENABLE ROW LEVEL SECURITY;

--
-- Name: opportunities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;

--
-- Name: opportunity_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.opportunity_events ENABLE ROW LEVEL SECURITY;

--
-- Name: opportunity_events opportunity_events_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY opportunity_events_own ON public.opportunity_events TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: opportunity_properties; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.opportunity_properties ENABLE ROW LEVEL SECURITY;

--
-- Name: opportunity_properties opportunity_properties_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY opportunity_properties_own ON public.opportunity_properties TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: account_access own access read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own access read" ON public.account_access FOR SELECT TO authenticated USING (((auth.uid() = user_id) OR public.is_admin(auth.uid())));


--
-- Name: assessor_quality_scores own aqs read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own aqs read" ON public.assessor_quality_scores FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: autonomy_rules own autonomy_rules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own autonomy_rules" ON public.autonomy_rules TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: calendar_connections own calendar connections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own calendar connections" ON public.calendar_connections TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: consultant_preferences own consultant_preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own consultant_preferences" ON public.consultant_preferences TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: daily_priorities own daily_priorities delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own daily_priorities delete" ON public.daily_priorities FOR DELETE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: daily_priorities own daily_priorities insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own daily_priorities insert" ON public.daily_priorities FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: daily_priorities own daily_priorities read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own daily_priorities read" ON public.daily_priorities FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: daily_priorities own daily_priorities update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own daily_priorities update" ON public.daily_priorities FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: follow_ups own follow_ups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own follow_ups" ON public.follow_ups TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: interactions own interactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own interactions" ON public.interactions TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: whatsapp_link_codes own link codes read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own link codes read" ON public.whatsapp_link_codes FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: calendar_event_links own links readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own links readable" ON public.calendar_event_links FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: assessor_messages own messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own messages" ON public.assessor_messages TO authenticated USING (((auth.uid() = user_id) AND (archived_at IS NULL))) WITH CHECK ((auth.uid() = user_id));


--
-- Name: financial_movements own movements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own movements" ON public.financial_movements TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: assessor_nudges own nudges read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own nudges read" ON public.assessor_nudges FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: opportunities own opportunities; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own opportunities" ON public.opportunities TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: people own people; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own people" ON public.people TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: profiles own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own profile" ON public.profiles TO authenticated USING ((auth.uid() = id)) WITH CHECK ((auth.uid() = id));


--
-- Name: properties own properties; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own properties" ON public.properties TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: property_interests own property_interests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own property_interests" ON public.property_interests TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: property_marketing_activities own property_marketing; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own property_marketing" ON public.property_marketing_activities TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: property_offers own property_offers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own property_offers" ON public.property_offers TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: calendar_sync_log own sync log readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own sync log readable" ON public.calendar_sync_log FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: calendar_sync_state own sync state readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own sync state readable" ON public.calendar_sync_state FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: assessor_tool_calls own tool calls; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own tool calls" ON public.assessor_tool_calls FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: pending_actions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pending_actions ENABLE ROW LEVEL SECURITY;

--
-- Name: pending_actions pending_actions_owner_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pending_actions_owner_all ON public.pending_actions TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: people; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;

--
-- Name: person_phones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.person_phones ENABLE ROW LEVEL SECURITY;

--
-- Name: person_phones person_phones_owner_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY person_phones_owner_all ON public.person_phones TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: pilot_participants pilot participant read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pilot participant read" ON public.pilot_participants FOR SELECT TO authenticated USING (((auth.uid() = user_id) OR public.is_admin(auth.uid())));


--
-- Name: pilot_invite_deliveries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pilot_invite_deliveries ENABLE ROW LEVEL SECURITY;

--
-- Name: pilot_participants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pilot_participants ENABLE ROW LEVEL SECURITY;

--
-- Name: pilots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pilots ENABLE ROW LEVEL SECURITY;

--
-- Name: plan_configs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.plan_configs ENABLE ROW LEVEL SECURITY;

--
-- Name: proactive_daily_ledger; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.proactive_daily_ledger ENABLE ROW LEVEL SECURITY;

--
-- Name: product_feedback; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_feedback ENABLE ROW LEVEL SECURITY;

--
-- Name: product_feedback product_feedback_admin_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY product_feedback_admin_delete ON public.product_feedback FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));


--
-- Name: product_feedback product_feedback_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY product_feedback_admin_update ON public.product_feedback FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));


--
-- Name: product_feedback product_feedback_owner_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY product_feedback_owner_insert ON public.product_feedback FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: product_feedback product_feedback_owner_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY product_feedback_owner_read ON public.product_feedback FOR SELECT TO authenticated USING (((auth.uid() = user_id) OR public.is_admin(auth.uid())));


--
-- Name: product_telemetry_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_telemetry_events ENABLE ROW LEVEL SECURITY;

--
-- Name: product_updates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_updates ENABLE ROW LEVEL SECURITY;

--
-- Name: product_updates product_updates_admin_manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY product_updates_admin_manage ON public.product_updates TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));


--
-- Name: product_updates product_updates_read_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY product_updates_read_authenticated ON public.product_updates FOR SELECT TO authenticated USING ((is_published = true));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: promo_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;

--
-- Name: promo_redemptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.promo_redemptions ENABLE ROW LEVEL SECURITY;

--
-- Name: promo_redemptions promo_redemptions_owner_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY promo_redemptions_owner_select ON public.promo_redemptions FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: properties; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;

--
-- Name: property_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.property_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: property_interests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.property_interests ENABLE ROW LEVEL SECURITY;

--
-- Name: property_marketing_activities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.property_marketing_activities ENABLE ROW LEVEL SECURITY;

--
-- Name: property_offers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.property_offers ENABLE ROW LEVEL SECURITY;

--
-- Name: prospecting_leads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.prospecting_leads ENABLE ROW LEVEL SECURITY;

--
-- Name: prospecting_leads prospecting_leads_owner_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prospecting_leads_owner_all ON public.prospecting_leads TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: assessor_reasoning_traces reasoning_traces_owner_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reasoning_traces_owner_select ON public.assessor_reasoning_traces FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: assistant_reflections reflections_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reflections_admin_read ON public.assistant_reflections FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));


--
-- Name: reminders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

--
-- Name: reminders reminders_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reminders_owner ON public.reminders TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: routines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.routines ENABLE ROW LEVEL SECURITY;

--
-- Name: routines routines_owner_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY routines_owner_all ON public.routines TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: admin_cost_settings service_role_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_only ON public.admin_cost_settings TO service_role USING (true) WITH CHECK (true);


--
-- Name: admin_messages service_role_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_only ON public.admin_messages TO service_role USING (true) WITH CHECK (true);


--
-- Name: ai_model_rates service_role_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_only ON public.ai_model_rates TO service_role USING (true) WITH CHECK (true);


--
-- Name: app_user_connection_aliases service_role_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_only ON public.app_user_connection_aliases TO service_role USING (true) WITH CHECK (true);


--
-- Name: app_user_connections service_role_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_only ON public.app_user_connections TO service_role USING (true) WITH CHECK (true);


--
-- Name: dashboard_login_tokens service_role_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_only ON public.dashboard_login_tokens TO service_role USING (true) WITH CHECK (true);


--
-- Name: support_sessions service_role_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_only ON public.support_sessions TO service_role USING (true) WITH CHECK (true);


--
-- Name: telegram_pairings service_role_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_only ON public.telegram_pairings TO service_role USING (true) WITH CHECK (true);


--
-- Name: assistant_shadow_runs shadow_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY shadow_admin_read ON public.assistant_shadow_runs FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));


--
-- Name: short_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.short_links ENABLE ROW LEVEL SECURITY;

--
-- Name: short_links short_links_owner_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY short_links_owner_select ON public.short_links FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: similar_listing_searches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.similar_listing_searches ENABLE ROW LEVEL SECURITY;

--
-- Name: staging_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.staging_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: stripe_webhook_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

--
-- Name: subscription_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;

--
-- Name: subscription_events subscription_events_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY subscription_events_admin_read ON public.subscription_events FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));


--
-- Name: support_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.support_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

--
-- Name: tags tags_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tags_own ON public.tags TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: telegram_invites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.telegram_invites ENABLE ROW LEVEL SECURITY;

--
-- Name: telegram_invites telegram_invites_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY telegram_invites_admin_all ON public.telegram_invites TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));


--
-- Name: telegram_link_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.telegram_link_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: telegram_link_tokens telegram_link_tokens_own_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY telegram_link_tokens_own_select ON public.telegram_link_tokens FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: telegram_pairings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.telegram_pairings ENABLE ROW LEVEL SECURITY;

--
-- Name: product_telemetry_events telemetry_own_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY telemetry_own_insert ON public.product_telemetry_events FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: product_telemetry_events telemetry_own_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY telemetry_own_select ON public.product_telemetry_events FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: assistant_trust_scores trust_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY trust_admin_read ON public.assistant_trust_scores FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));


--
-- Name: uploaded_files; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.uploaded_files ENABLE ROW LEVEL SECURITY;

--
-- Name: uploaded_files uploaded_files_owner_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY uploaded_files_owner_delete ON public.uploaded_files FOR DELETE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: uploaded_files uploaded_files_owner_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY uploaded_files_owner_insert ON public.uploaded_files FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: uploaded_files uploaded_files_owner_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY uploaded_files_owner_select ON public.uploaded_files FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: uploaded_files uploaded_files_owner_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY uploaded_files_owner_update ON public.uploaded_files FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: access_waitlist waitlist read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "waitlist read" ON public.access_waitlist FOR SELECT TO authenticated USING (((auth.uid() = user_id) OR public.is_admin(auth.uid())));


--
-- Name: whatsapp_link_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_link_codes ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_proactive_tests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_proactive_tests ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_send_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_send_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_template_bindings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_template_bindings ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_template_rates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_template_rates ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION account_access_on_new_profile(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.account_access_on_new_profile() FROM PUBLIC;


--
-- Name: FUNCTION audit_sensitive_write(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.audit_sensitive_write() FROM PUBLIC;


--
-- Name: FUNCTION claim_inbound_message(_channel text, _external_id text, _stale_seconds integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.claim_inbound_message(_channel text, _external_id text, _stale_seconds integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.claim_inbound_message(_channel text, _external_id text, _stale_seconds integer) TO service_role;


--
-- Name: FUNCTION claim_pending_confirmation(_user_id uuid, _ids uuid[], _token text, _ttl_seconds integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.claim_pending_confirmation(_user_id uuid, _ids uuid[], _token text, _ttl_seconds integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.claim_pending_confirmation(_user_id uuid, _ids uuid[], _token text, _ttl_seconds integer) TO service_role;


--
-- Name: FUNCTION consume_access_invite(_token_hash text, _user_id uuid, _channel text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.consume_access_invite(_token_hash text, _user_id uuid, _channel text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.consume_access_invite(_token_hash text, _user_id uuid, _channel text) TO service_role;


--
-- Name: FUNCTION conversation_states_touch(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.conversation_states_touch() FROM PUBLIC;
GRANT ALL ON FUNCTION public.conversation_states_touch() TO service_role;


--
-- Name: FUNCTION effective_tier(_user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.effective_tier(_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.effective_tier(_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.effective_tier(_user_id uuid) TO service_role;


--
-- Name: FUNCTION expire_beta_testers(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.expire_beta_testers() FROM PUBLIC;
GRANT ALL ON FUNCTION public.expire_beta_testers() TO service_role;


--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;


--
-- Name: FUNCTION has_role(_user_id uuid, _role public.app_role); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.has_role(_user_id uuid, _role public.app_role) FROM PUBLIC;
GRANT ALL ON FUNCTION public.has_role(_user_id uuid, _role public.app_role) TO service_role;
GRANT ALL ON FUNCTION public.has_role(_user_id uuid, _role public.app_role) TO authenticated;


--
-- Name: FUNCTION has_staging_access(_user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.has_staging_access(_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.has_staging_access(_user_id uuid) TO authenticated;


--
-- Name: FUNCTION is_admin(_user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_admin(_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_admin(_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_admin(_user_id uuid) TO service_role;


--
-- Name: FUNCTION issue_pilot_invite(_pilot_key text, _issuer uuid, _token_hash text, _idempotency_key text, _note text, _issued_via text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.issue_pilot_invite(_pilot_key text, _issuer uuid, _token_hash text, _idempotency_key text, _note text, _issued_via text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.issue_pilot_invite(_pilot_key text, _issuer uuid, _token_hash text, _idempotency_key text, _note text, _issued_via text) TO service_role;


--
-- Name: FUNCTION issue_referral_invite(_issuer uuid, _token_hash text, _ttl_days integer, _quota integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.issue_referral_invite(_issuer uuid, _token_hash text, _ttl_days integer, _quota integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.issue_referral_invite(_issuer uuid, _token_hash text, _ttl_days integer, _quota integer) TO service_role;


--
-- Name: FUNCTION mark_pending_presented(_user_id uuid, _ids uuid[], _channel text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mark_pending_presented(_user_id uuid, _ids uuid[], _channel text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mark_pending_presented(_user_id uuid, _ids uuid[], _channel text) TO service_role;


--
-- Name: FUNCTION merge_accounts_apply(_source uuid, _target uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.merge_accounts_apply(_source uuid, _target uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.merge_accounts_apply(_source uuid, _target uuid) TO service_role;


--
-- Name: FUNCTION merge_accounts_preview(_source uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.merge_accounts_preview(_source uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.merge_accounts_preview(_source uuid) TO service_role;


--
-- Name: FUNCTION pending_actions_validate(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pending_actions_validate() FROM PUBLIC;
GRANT ALL ON FUNCTION public.pending_actions_validate() TO service_role;


--
-- Name: FUNCTION pilot_participant_on_invite_used(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pilot_participant_on_invite_used() FROM PUBLIC;


--
-- Name: FUNCTION purge_admin_audit_logs(_keep_days integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.purge_admin_audit_logs(_keep_days integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.purge_admin_audit_logs(_keep_days integer) TO service_role;


--
-- Name: FUNCTION release_conversation_lock(_user_id uuid, _channel text, _holder text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.release_conversation_lock(_user_id uuid, _channel text, _holder text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.release_conversation_lock(_user_id uuid, _channel text, _holder text) TO service_role;


--
-- Name: FUNCTION release_pending_confirmation(_user_id uuid, _token text, _channel text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.release_pending_confirmation(_user_id uuid, _token text, _channel text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.release_pending_confirmation(_user_id uuid, _token text, _channel text) TO service_role;


--
-- Name: FUNCTION release_unsolicited_slot(_user_id uuid, _day date, _ref_key text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.release_unsolicited_slot(_user_id uuid, _day date, _ref_key text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.release_unsolicited_slot(_user_id uuid, _day date, _ref_key text) TO service_role;


--
-- Name: FUNCTION reserve_unsolicited_slot(_user_id uuid, _day date, _source text, _ref_key text, _cap integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.reserve_unsolicited_slot(_user_id uuid, _day date, _source text, _ref_key text, _cap integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reserve_unsolicited_slot(_user_id uuid, _day date, _source text, _ref_key text, _cap integer) TO service_role;


--
-- Name: FUNCTION revoke_pilot_invite(_pilot_key text, _actor uuid, _invite_id uuid, _token_hash text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.revoke_pilot_invite(_pilot_key text, _actor uuid, _invite_id uuid, _token_hash text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.revoke_pilot_invite(_pilot_key text, _actor uuid, _invite_id uuid, _token_hash text) TO service_role;


--
-- Name: FUNCTION set_updated_at(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC;


--
-- Name: FUNCTION tier_at_least(_user_id uuid, _min text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.tier_at_least(_user_id uuid, _min text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.tier_at_least(_user_id uuid, _min text) TO service_role;


--
-- Name: FUNCTION try_acquire_conversation_lock(_user_id uuid, _channel text, _ttl_seconds integer, _holder text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.try_acquire_conversation_lock(_user_id uuid, _channel text, _ttl_seconds integer, _holder text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.try_acquire_conversation_lock(_user_id uuid, _channel text, _ttl_seconds integer, _holder text) TO service_role;


--
-- Name: TABLE access_invite_attempts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.access_invite_attempts TO service_role;
GRANT SELECT ON TABLE public.access_invite_attempts TO authenticated;


--
-- Name: TABLE access_invites; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.access_invites TO authenticated;
GRANT ALL ON TABLE public.access_invites TO service_role;


--
-- Name: TABLE access_waitlist; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.access_waitlist TO authenticated;
GRANT ALL ON TABLE public.access_waitlist TO service_role;


--
-- Name: TABLE account_access; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.account_access TO authenticated;
GRANT ALL ON TABLE public.account_access TO service_role;


--
-- Name: TABLE admin_audit_logs; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.admin_audit_logs TO authenticated;
GRANT ALL ON TABLE public.admin_audit_logs TO service_role;


--
-- Name: TABLE admin_broadcast_recipients; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.admin_broadcast_recipients TO authenticated;
GRANT ALL ON TABLE public.admin_broadcast_recipients TO service_role;


--
-- Name: TABLE admin_broadcasts; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.admin_broadcasts TO authenticated;
GRANT ALL ON TABLE public.admin_broadcasts TO service_role;


--
-- Name: TABLE admin_cost_settings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.admin_cost_settings TO service_role;


--
-- Name: TABLE admin_messages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.admin_messages TO service_role;


--
-- Name: TABLE admin_mfa_required; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.admin_mfa_required TO authenticated;
GRANT ALL ON TABLE public.admin_mfa_required TO service_role;


--
-- Name: TABLE ai_model_rates; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.ai_model_rates TO service_role;


--
-- Name: TABLE alert_mutes; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.alert_mutes TO authenticated;
GRANT ALL ON TABLE public.alert_mutes TO service_role;


--
-- Name: TABLE announcement_dismissals; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE ON TABLE public.announcement_dismissals TO authenticated;
GRANT ALL ON TABLE public.announcement_dismissals TO service_role;


--
-- Name: TABLE app_settings; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.app_settings TO authenticated;
GRANT ALL ON TABLE public.app_settings TO service_role;


--
-- Name: TABLE app_user_connection_aliases; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.app_user_connection_aliases TO service_role;


--
-- Name: TABLE app_user_connections; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.app_user_connections TO service_role;


--
-- Name: TABLE assessor_ai_logs; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.assessor_ai_logs TO authenticated;
GRANT ALL ON TABLE public.assessor_ai_logs TO service_role;


--
-- Name: TABLE assessor_messages; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.assessor_messages TO authenticated;
GRANT ALL ON TABLE public.assessor_messages TO service_role;


--
-- Name: TABLE assessor_nudges; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.assessor_nudges TO authenticated;
GRANT ALL ON TABLE public.assessor_nudges TO service_role;


--
-- Name: TABLE assessor_quality_scores; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.assessor_quality_scores TO authenticated;
GRANT ALL ON TABLE public.assessor_quality_scores TO service_role;


--
-- Name: TABLE assessor_reasoning_traces; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.assessor_reasoning_traces TO authenticated;
GRANT ALL ON TABLE public.assessor_reasoning_traces TO service_role;


--
-- Name: TABLE assessor_tool_calls; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.assessor_tool_calls TO authenticated;
GRANT ALL ON TABLE public.assessor_tool_calls TO service_role;


--
-- Name: TABLE assistant_golden_conversations; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.assistant_golden_conversations TO authenticated;
GRANT ALL ON TABLE public.assistant_golden_conversations TO service_role;


--
-- Name: TABLE assistant_golden_runs; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.assistant_golden_runs TO authenticated;
GRANT ALL ON TABLE public.assistant_golden_runs TO service_role;


--
-- Name: TABLE assistant_reflections; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.assistant_reflections TO authenticated;
GRANT ALL ON TABLE public.assistant_reflections TO service_role;


--
-- Name: TABLE assistant_shadow_runs; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.assistant_shadow_runs TO authenticated;
GRANT ALL ON TABLE public.assistant_shadow_runs TO service_role;


--
-- Name: TABLE assistant_trust_scores; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.assistant_trust_scores TO authenticated;
GRANT ALL ON TABLE public.assistant_trust_scores TO service_role;


--
-- Name: TABLE assistant_user_corrections; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.assistant_user_corrections TO authenticated;
GRANT ALL ON TABLE public.assistant_user_corrections TO service_role;


--
-- Name: TABLE autonomy_rules; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.autonomy_rules TO authenticated;
GRANT ALL ON TABLE public.autonomy_rules TO service_role;


--
-- Name: TABLE billing_test_accounts; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.billing_test_accounts TO authenticated;
GRANT ALL ON TABLE public.billing_test_accounts TO service_role;


--
-- Name: TABLE calendar_connections; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.calendar_connections TO authenticated;
GRANT ALL ON TABLE public.calendar_connections TO service_role;


--
-- Name: TABLE calendar_event_links; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.calendar_event_links TO authenticated;
GRANT ALL ON TABLE public.calendar_event_links TO service_role;


--
-- Name: TABLE calendar_sync_log; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.calendar_sync_log TO authenticated;
GRANT ALL ON TABLE public.calendar_sync_log TO service_role;


--
-- Name: TABLE calendar_sync_state; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.calendar_sync_state TO authenticated;
GRANT ALL ON TABLE public.calendar_sync_state TO service_role;


--
-- Name: TABLE channel_links; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.channel_links TO authenticated;
GRANT ALL ON TABLE public.channel_links TO service_role;


--
-- Name: TABLE consultant_preferences; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.consultant_preferences TO authenticated;
GRANT ALL ON TABLE public.consultant_preferences TO service_role;


--
-- Name: TABLE content_access_consents; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.content_access_consents TO authenticated;
GRANT ALL ON TABLE public.content_access_consents TO service_role;


--
-- Name: TABLE conversation_locks; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.conversation_locks TO service_role;


--
-- Name: TABLE conversation_states; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.conversation_states TO authenticated;
GRANT ALL ON TABLE public.conversation_states TO service_role;


--
-- Name: TABLE daily_digests; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.daily_digests TO authenticated;
GRANT ALL ON TABLE public.daily_digests TO service_role;


--
-- Name: TABLE daily_priorities; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.daily_priorities TO authenticated;
GRANT ALL ON TABLE public.daily_priorities TO service_role;


--
-- Name: TABLE dashboard_announcements; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.dashboard_announcements TO authenticated;
GRANT ALL ON TABLE public.dashboard_announcements TO service_role;


--
-- Name: TABLE dashboard_login_tokens; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.dashboard_login_tokens TO service_role;


--
-- Name: TABLE deal_deadlines; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.deal_deadlines TO authenticated;
GRANT ALL ON TABLE public.deal_deadlines TO service_role;


--
-- Name: TABLE email_connections; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.email_connections TO authenticated;
GRANT ALL ON TABLE public.email_connections TO service_role;


--
-- Name: TABLE email_drafts; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.email_drafts TO authenticated;
GRANT ALL ON TABLE public.email_drafts TO service_role;


--
-- Name: TABLE email_messages; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.email_messages TO authenticated;
GRANT ALL ON TABLE public.email_messages TO service_role;


--
-- Name: TABLE email_threads; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.email_threads TO authenticated;
GRANT ALL ON TABLE public.email_threads TO service_role;


--
-- Name: TABLE entity_tags; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.entity_tags TO authenticated;
GRANT ALL ON TABLE public.entity_tags TO service_role;


--
-- Name: TABLE event_categories; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.event_categories TO authenticated;
GRANT ALL ON TABLE public.event_categories TO service_role;


--
-- Name: TABLE feature_flag_users; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.feature_flag_users TO authenticated;
GRANT ALL ON TABLE public.feature_flag_users TO service_role;


--
-- Name: TABLE feature_flags; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.feature_flags TO authenticated;
GRANT ALL ON TABLE public.feature_flags TO service_role;


--
-- Name: TABLE file_categories; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.file_categories TO authenticated;
GRANT ALL ON TABLE public.file_categories TO service_role;


--
-- Name: TABLE file_links; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.file_links TO authenticated;
GRANT ALL ON TABLE public.file_links TO service_role;


--
-- Name: TABLE financial_movements; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.financial_movements TO authenticated;
GRANT ALL ON TABLE public.financial_movements TO service_role;


--
-- Name: TABLE folder_items; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.folder_items TO authenticated;
GRANT ALL ON TABLE public.folder_items TO service_role;


--
-- Name: TABLE folders; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.folders TO authenticated;
GRANT ALL ON TABLE public.folders TO service_role;


--
-- Name: TABLE follow_ups; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.follow_ups TO authenticated;
GRANT ALL ON TABLE public.follow_ups TO service_role;


--
-- Name: TABLE inbound_message_claims; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.inbound_message_claims TO authenticated;
GRANT ALL ON TABLE public.inbound_message_claims TO service_role;


--
-- Name: TABLE interactions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.interactions TO authenticated;
GRANT ALL ON TABLE public.interactions TO service_role;


--
-- Name: TABLE invite_send_attempts; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.invite_send_attempts TO authenticated;
GRANT ALL ON TABLE public.invite_send_attempts TO service_role;


--
-- Name: TABLE landing_page_visits; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.landing_page_visits TO service_role;


--
-- Name: TABLE mentor_decisions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.mentor_decisions TO authenticated;
GRANT ALL ON TABLE public.mentor_decisions TO service_role;


--
-- Name: TABLE miscellaneous_items; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.miscellaneous_items TO authenticated;
GRANT ALL ON TABLE public.miscellaneous_items TO service_role;


--
-- Name: TABLE opportunities; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.opportunities TO authenticated;
GRANT ALL ON TABLE public.opportunities TO service_role;


--
-- Name: TABLE opportunity_events; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.opportunity_events TO authenticated;
GRANT ALL ON TABLE public.opportunity_events TO service_role;


--
-- Name: TABLE opportunity_properties; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.opportunity_properties TO authenticated;
GRANT ALL ON TABLE public.opportunity_properties TO service_role;


--
-- Name: TABLE pending_actions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.pending_actions TO authenticated;
GRANT ALL ON TABLE public.pending_actions TO service_role;


--
-- Name: TABLE people; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.people TO authenticated;
GRANT ALL ON TABLE public.people TO service_role;


--
-- Name: TABLE person_phones; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.person_phones TO authenticated;
GRANT ALL ON TABLE public.person_phones TO service_role;


--
-- Name: TABLE pilot_invite_deliveries; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.pilot_invite_deliveries TO authenticated;
GRANT ALL ON TABLE public.pilot_invite_deliveries TO service_role;


--
-- Name: TABLE pilot_participants; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.pilot_participants TO authenticated;
GRANT ALL ON TABLE public.pilot_participants TO service_role;


--
-- Name: TABLE pilots; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.pilots TO authenticated;
GRANT ALL ON TABLE public.pilots TO service_role;


--
-- Name: TABLE plan_configs; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.plan_configs TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.plan_configs TO authenticated;
GRANT ALL ON TABLE public.plan_configs TO service_role;


--
-- Name: TABLE proactive_daily_ledger; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.proactive_daily_ledger TO authenticated;
GRANT ALL ON TABLE public.proactive_daily_ledger TO service_role;


--
-- Name: TABLE product_feedback; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.product_feedback TO authenticated;
GRANT ALL ON TABLE public.product_feedback TO service_role;


--
-- Name: TABLE product_telemetry_events; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT ON TABLE public.product_telemetry_events TO authenticated;
GRANT ALL ON TABLE public.product_telemetry_events TO service_role;


--
-- Name: TABLE product_updates; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.product_updates TO authenticated;
GRANT ALL ON TABLE public.product_updates TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;


--
-- Name: COLUMN profiles.name; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(name) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.email; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(email) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.phone; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(phone) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.updated_at; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(updated_at) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.assessor_name; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(assessor_name) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.primary_channel; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(primary_channel) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.onboarding_goals; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(onboarding_goals) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.onboarding_stage; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(onboarding_stage) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.onboarding_offers; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(onboarding_offers) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.onboarding_last_offer_at; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(onboarding_last_offer_at) ON TABLE public.profiles TO authenticated;


--
-- Name: TABLE promo_codes; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.promo_codes TO authenticated;
GRANT ALL ON TABLE public.promo_codes TO service_role;


--
-- Name: TABLE promo_redemptions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.promo_redemptions TO authenticated;
GRANT ALL ON TABLE public.promo_redemptions TO service_role;


--
-- Name: TABLE properties; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.properties TO authenticated;
GRANT ALL ON TABLE public.properties TO service_role;


--
-- Name: TABLE property_categories; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.property_categories TO authenticated;
GRANT ALL ON TABLE public.property_categories TO service_role;


--
-- Name: TABLE property_interests; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.property_interests TO authenticated;
GRANT ALL ON TABLE public.property_interests TO service_role;


--
-- Name: TABLE property_marketing_activities; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.property_marketing_activities TO authenticated;
GRANT ALL ON TABLE public.property_marketing_activities TO service_role;


--
-- Name: TABLE property_offers; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.property_offers TO authenticated;
GRANT ALL ON TABLE public.property_offers TO service_role;


--
-- Name: TABLE prospecting_leads; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.prospecting_leads TO authenticated;
GRANT ALL ON TABLE public.prospecting_leads TO service_role;


--
-- Name: TABLE reminders; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.reminders TO authenticated;
GRANT ALL ON TABLE public.reminders TO service_role;


--
-- Name: TABLE routines; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.routines TO authenticated;
GRANT ALL ON TABLE public.routines TO service_role;


--
-- Name: TABLE short_links; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.short_links TO authenticated;
GRANT ALL ON TABLE public.short_links TO service_role;


--
-- Name: TABLE similar_listing_searches; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT ON TABLE public.similar_listing_searches TO authenticated;
GRANT ALL ON TABLE public.similar_listing_searches TO service_role;


--
-- Name: TABLE staging_notes; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.staging_notes TO authenticated;
GRANT ALL ON TABLE public.staging_notes TO service_role;


--
-- Name: TABLE stripe_webhook_events; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.stripe_webhook_events TO authenticated;
GRANT ALL ON TABLE public.stripe_webhook_events TO service_role;


--
-- Name: TABLE subscription_events; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.subscription_events TO authenticated;
GRANT ALL ON TABLE public.subscription_events TO service_role;


--
-- Name: TABLE support_sessions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.support_sessions TO service_role;


--
-- Name: TABLE tags; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.tags TO authenticated;
GRANT ALL ON TABLE public.tags TO service_role;


--
-- Name: TABLE telegram_invites; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.telegram_invites TO authenticated;
GRANT ALL ON TABLE public.telegram_invites TO service_role;


--
-- Name: TABLE telegram_link_tokens; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.telegram_link_tokens TO authenticated;
GRANT ALL ON TABLE public.telegram_link_tokens TO service_role;


--
-- Name: TABLE telegram_pairings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.telegram_pairings TO service_role;


--
-- Name: TABLE uploaded_files; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.uploaded_files TO authenticated;
GRANT ALL ON TABLE public.uploaded_files TO service_role;


--
-- Name: TABLE user_roles; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.user_roles TO authenticated;
GRANT ALL ON TABLE public.user_roles TO service_role;


--
-- Name: TABLE whatsapp_link_codes; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.whatsapp_link_codes TO authenticated;
GRANT ALL ON TABLE public.whatsapp_link_codes TO service_role;


--
-- Name: TABLE whatsapp_proactive_tests; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.whatsapp_proactive_tests TO authenticated;
GRANT ALL ON TABLE public.whatsapp_proactive_tests TO service_role;


--
-- Name: TABLE whatsapp_send_logs; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.whatsapp_send_logs TO authenticated;
GRANT ALL ON TABLE public.whatsapp_send_logs TO service_role;


--
-- Name: TABLE whatsapp_template_bindings; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.whatsapp_template_bindings TO authenticated;
GRANT ALL ON TABLE public.whatsapp_template_bindings TO service_role;


--
-- Name: TABLE whatsapp_template_rates; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.whatsapp_template_rates TO authenticated;
GRANT ALL ON TABLE public.whatsapp_template_rates TO service_role;


--
-- PostgreSQL database dump complete
--

\unrestrict xXQyj2X5J2bpFmw6l2rn76oiqHz35eML2NCP0VJywtctoMgmR78Dmsqnn842IuM

