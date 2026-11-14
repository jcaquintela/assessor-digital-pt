-- Early Access por convite (fase 1). Tudo aditivo; interruptores desligados.
CREATE TABLE public.account_access (
  user_id uuid PRIMARY KEY,
  state text NOT NULL DEFAULT 'registered_waiting',
  invite_id uuid,
  source text,
  activated_at timestamptz,
  trial_started_at timestamptz,
  waitlist_offered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT account_access_state_chk CHECK (state IN ('registered_waiting','invited','activated','trialing','subscribed'))
);
GRANT SELECT ON public.account_access TO authenticated;
GRANT ALL ON public.account_access TO service_role;
ALTER TABLE public.account_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own access read" ON public.account_access FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE TABLE public.access_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  issuer_user_id uuid,
  source text NOT NULL,
  status text NOT NULL DEFAULT 'issued',
  note text,
  expires_at timestamptz NOT NULL,
  used_by uuid,
  used_at timestamptz,
  used_channel text,
  revoked_at timestamptz,
  revoked_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT access_invites_source_chk CHECK (source IN ('beta_tester','admin')),
  CONSTRAINT access_invites_status_chk CHECK (status IN ('issued','used','revoked'))
);
CREATE INDEX access_invites_issuer_idx ON public.access_invites (issuer_user_id, status);
GRANT SELECT ON public.access_invites TO authenticated;
GRANT ALL ON public.access_invites TO service_role;
ALTER TABLE public.access_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin invites read" ON public.access_invites FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE TABLE public.access_invite_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  channel text,
  ok boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX access_invite_attempts_user_idx ON public.access_invite_attempts (user_id, created_at DESC);
GRANT ALL ON public.access_invite_attempts TO service_role;
ALTER TABLE public.access_invite_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin attempts read" ON public.access_invite_attempts FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));
GRANT SELECT ON public.access_invite_attempts TO authenticated;

CREATE TABLE public.access_waitlist (
  user_id uuid PRIMARY KEY,
  channel text,
  consent_contact boolean NOT NULL DEFAULT false,
  consent_at timestamptz,
  notify boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'waiting',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT access_waitlist_status_chk CHECK (status IN ('waiting','granted','removed'))
);
GRANT SELECT ON public.access_waitlist TO authenticated;
GRANT ALL ON public.access_waitlist TO service_role;
ALTER TABLE public.access_waitlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "waitlist read" ON public.access_waitlist FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

-- Contas criadas com o gate global ligado nascem em espera (qualquer via).
CREATE OR REPLACE FUNCTION public.account_access_on_new_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.feature_flags
             WHERE key = 'access.early_access_gate.v1' AND enabled_globally = true) THEN
    INSERT INTO public.account_access (user_id, state, source)
    VALUES (NEW.id, 'registered_waiting', 'signup') ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER profiles_account_access_new
AFTER INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.account_access_on_new_profile();

-- Consumo atómico: no máximo um sucesso por convite.
CREATE OR REPLACE FUNCTION public.consume_access_invite(_token_hash text, _user_id uuid, _channel text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

-- Emissão por beta tester com quota atómica (vivos + usados < quota).
CREATE OR REPLACE FUNCTION public.issue_referral_invite(_issuer uuid, _token_hash text, _ttl_days integer, _quota integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

REVOKE ALL ON FUNCTION public.consume_access_invite(text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.issue_referral_invite(uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_access_invite(text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.issue_referral_invite(uuid, text, integer, integer) TO service_role;

INSERT INTO public.feature_flags (key, enabled_globally, description)
VALUES
  ('access.early_access_gate.v1', false, 'Early access: contas novas sem convite ficam em espera'),
  ('access.referral_invites.v1', false, 'Beta testers geram convites (3, 7 dias) em conversa'),
  ('access.waitlist.v1', false, 'Lista de espera com consentimento na conversa')
ON CONFLICT (key) DO NOTHING;