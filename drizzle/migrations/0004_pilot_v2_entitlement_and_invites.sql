-- Piloto AFONSO 2.0: participação própria (independente de beta/plano/canais)
-- e convites do piloto com teto próprio. Tudo aditivo; interruptores desligados;
-- piloto em 'no_go' (a base de dados recusa emitir convites enquanto assim estiver).
CREATE TABLE public.pilots (
  key text PRIMARY KEY,
  status text NOT NULL DEFAULT 'no_go',
  invite_issuer_user_id uuid,
  invite_cap integer NOT NULL DEFAULT 2,
  invite_ttl_days integer NOT NULL DEFAULT 7,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pilots_status_chk CHECK (status IN ('no_go','go','closed')),
  CONSTRAINT pilots_cap_chk CHECK (invite_cap >= 0),
  CONSTRAINT pilots_ttl_chk CHECK (invite_ttl_days BETWEEN 1 AND 30)
);
GRANT SELECT ON public.pilots TO authenticated;
GRANT ALL ON public.pilots TO service_role;
ALTER TABLE public.pilots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin pilots read" ON public.pilots FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE TABLE public.pilot_participants (
  pilot_key text NOT NULL REFERENCES public.pilots(key),
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active',
  source text NOT NULL,
  invite_id uuid,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pilot_key, user_id),
  CONSTRAINT pilot_participants_status_chk CHECK (status IN ('active','excluded')),
  CONSTRAINT pilot_participants_source_chk CHECK (source IN ('seed','invite','admin'))
);
GRANT SELECT ON public.pilot_participants TO authenticated;
GRANT ALL ON public.pilot_participants TO service_role;
ALTER TABLE public.pilot_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pilot participant read" ON public.pilot_participants FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

-- Convites do piloto vivem na mesma tabela, com origem própria ('pilot'),
-- para não contarem na quota geral de beta testers.
ALTER TABLE public.access_invites
  ADD COLUMN pilot_key text REFERENCES public.pilots(key),
  ADD COLUMN idempotency_key text;
ALTER TABLE public.access_invites DROP CONSTRAINT access_invites_source_chk;
ALTER TABLE public.access_invites ADD CONSTRAINT access_invites_source_chk
  CHECK (source IN ('beta_tester','admin','pilot'));
ALTER TABLE public.access_invites ADD CONSTRAINT access_invites_pilot_chk
  CHECK ((source = 'pilot') = (pilot_key IS NOT NULL));
CREATE UNIQUE INDEX access_invites_idem_uidx ON public.access_invites (issuer_user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX access_invites_pilot_idx ON public.access_invites (pilot_key, status) WHERE pilot_key IS NOT NULL;

-- Emissão de convite do piloto: só o emissor designado, só com o piloto em 'go',
-- teto vivos+usados < invite_cap, idempotente por chave, serializada por piloto.
CREATE OR REPLACE FUNCTION public.issue_pilot_invite(_pilot_key text, _issuer uuid, _token_hash text, _idempotency_key text)
RETURNS TABLE (out_invite_id uuid, out_outcome text, out_remaining integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _p public.pilots%ROWTYPE; _id uuid; _n integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('pilot-invites:' || _pilot_key));
  SELECT * INTO _p FROM public.pilots WHERE key = _pilot_key FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT NULL::uuid, 'no_pilot'::text, 0; RETURN; END IF;
  IF _p.invite_issuer_user_id IS NULL OR _p.invite_issuer_user_id <> _issuer THEN
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
  INSERT INTO public.access_invites (token_hash, issuer_user_id, source, pilot_key, idempotency_key, expires_at)
  VALUES (_token_hash, _issuer, 'pilot', _pilot_key, _idempotency_key, now() + make_interval(days => _p.invite_ttl_days))
  RETURNING id INTO _id;
  RETURN QUERY SELECT _id, 'issued'::text, _p.invite_cap - _n - 1;
END $$;

-- Convite do piloto usado => o convidado entra no piloto (sem tocar em beta/plano).
CREATE OR REPLACE FUNCTION public.pilot_participant_on_invite_used()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.pilot_key IS NOT NULL AND NEW.status = 'used' AND OLD.status IS DISTINCT FROM 'used'
     AND NEW.used_by IS NOT NULL THEN
    INSERT INTO public.pilot_participants (pilot_key, user_id, status, source, invite_id)
    VALUES (NEW.pilot_key, NEW.used_by, 'active', 'invite', NEW.id)
    ON CONFLICT (pilot_key, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER access_invites_pilot_participant
AFTER UPDATE OF status ON public.access_invites FOR EACH ROW
EXECUTE FUNCTION public.pilot_participant_on_invite_used();

REVOKE ALL ON FUNCTION public.issue_pilot_invite(text, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pilot_participant_on_invite_used() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_pilot_invite(text, uuid, text, text) TO service_role;

-- Composição decidida pelo proprietário (14/11/2026). Sem efeito enquanto
-- `pilot.v2_entitlement.v1` estiver desligado. Não altera perfis, beta, plano ou canais.
INSERT INTO public.pilots (key, status, invite_issuer_user_id, invite_cap, invite_ttl_days, note)
VALUES ('afonso_v2', 'no_go', '08d24695-a12c-4954-887a-81a71215a87e', 2, 7,
        'Piloto AFONSO 2.0: 3 participantes + 2 convidados do Júlio')
ON CONFLICT (key) DO NOTHING;
INSERT INTO public.pilot_participants (pilot_key, user_id, status, source, reason) VALUES
  ('afonso_v2', '08d24695-a12c-4954-887a-81a71215a87e', 'active', 'seed', NULL),
  ('afonso_v2', '7a517907-2473-47ec-97b7-d4289fbe1b7b', 'active', 'seed', NULL),
  ('afonso_v2', 'df098797-b532-40bb-a298-003ef99fe81a', 'active', 'seed', NULL),
  ('afonso_v2', 'a748121b-c1ca-4ea3-adce-5ea60ac7a263', 'excluded', 'seed',
   'Decisão do proprietário 14/11/2026: fora do piloto; beta, plano e canais preservados')
ON CONFLICT (pilot_key, user_id) DO NOTHING;

INSERT INTO public.feature_flags (key, enabled_globally, description)
VALUES
  ('pilot.v2_entitlement.v1', false, 'Funções AFONSO 2.0 só para participantes ativos do piloto'),
  ('pilot.v2_invites.v1', false, 'Emissor do piloto gera convites do piloto (teto próprio) em conversa')
ON CONFLICT (key) DO NOTHING;