ALTER TABLE public.access_invites ADD COLUMN issued_via text;

DROP FUNCTION IF EXISTS public.issue_pilot_invite(text, uuid, text, text);

-- Emissão única para conversa e administração: emissor designado ou super_admin,
-- piloto em 'go', teto global do piloto (vivos + usados), 7 dias, idempotência, serializada.
CREATE OR REPLACE FUNCTION public.issue_pilot_invite(
  _pilot_key text, _issuer uuid, _token_hash text, _idempotency_key text,
  _note text DEFAULT NULL, _issued_via text DEFAULT NULL)
RETURNS TABLE (out_invite_id uuid, out_outcome text, out_remaining integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

-- Anulação única: quem emitiu, o emissor designado ou super_admin; só convites por usar.
CREATE OR REPLACE FUNCTION public.revoke_pilot_invite(_pilot_key text, _actor uuid, _invite_id uuid, _token_hash text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

-- Guarda: convites do piloto só nascem/anulam pelas funções acima; uso só issued->used;
-- nada se reativa, prolonga ou muda de piloto/origem.
CREATE OR REPLACE FUNCTION public.access_invites_pilot_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
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
CREATE TRIGGER access_invites_pilot_guard
BEFORE INSERT OR UPDATE ON public.access_invites FOR EACH ROW
EXECUTE FUNCTION public.access_invites_pilot_guard();

-- Guarda: um lugar ativo no piloto só se ganha com um convite do piloto usado pela própria pessoa.
CREATE OR REPLACE FUNCTION public.pilot_participants_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
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
CREATE TRIGGER pilot_participants_guard
BEFORE INSERT OR UPDATE ON public.pilot_participants FOR EACH ROW
EXECUTE FUNCTION public.pilot_participants_guard();

REVOKE ALL ON FUNCTION public.issue_pilot_invite(text, uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revoke_pilot_invite(text, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_pilot_invite(text, uuid, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_pilot_invite(text, uuid, uuid, text) TO service_role;