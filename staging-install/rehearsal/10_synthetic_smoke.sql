-- Ensaio funcional com dados 100% sintéticos (domínio .invalid, UUIDs fixos de teste).
-- Corre numa transação que termina em ROLLBACK: a base descartável fica como estava.
\set ON_ERROR_STOP 1
\pset tuples_only on
BEGIN;
SET LOCAL search_path = public, extensions;

-- T1: registo cria perfil (trigger em auth.users)
INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at) VALUES
 ('00000000-0000-4000-8000-00000000000a', 'consultor.a@afonso-staging.invalid', '{"name":"Consultor A (sintético)"}', now()),
 ('00000000-0000-4000-8000-00000000000b', 'consultor.b@afonso-staging.invalid', '{"name":"Consultor B (sintético)"}', now()),
 ('00000000-0000-4000-8000-00000000000c', 'tester.c@afonso-staging.invalid',   '{"name":"Tester C (sintético)"}', now());
DO $$ BEGIN
  IF (SELECT count(*) FROM public.profiles WHERE email LIKE '%@afonso-staging.invalid') <> 3 THEN RAISE EXCEPTION 'T1 falhou: perfis não criados'; END IF;
  RAISE NOTICE 'OK T1 perfis criados pelo registo';
END $$;
INSERT INTO public.user_roles (user_id, role) VALUES ('00000000-0000-4000-8000-00000000000c', 'tester');

-- T2/T3: isolamento entre consultores (RLS)
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
INSERT INTO public.people (user_id, name, phone) VALUES ('00000000-0000-4000-8000-00000000000a', 'Pessoa Sintética 1', '+999000000001');
DO $$ BEGIN
  IF (SELECT count(*) FROM public.people) <> 1 THEN RAISE EXCEPTION 'T2 falhou: A não vê a sua pessoa'; END IF;
  BEGIN
    INSERT INTO public.people (user_id, name) VALUES ('00000000-0000-4000-8000-00000000000b', 'Intrusa');
    RAISE EXCEPTION 'T2 falhou: A conseguiu escrever em nome de B';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF public.has_role('00000000-0000-4000-8000-00000000000a', 'super_admin') THEN RAISE EXCEPTION 'T2 falhou: A é super_admin'; END IF;
  IF (SELECT count(*) FROM public.staging_notes) <> 0 THEN RAISE EXCEPTION 'T2 falhou: consultor sem papel lê notas do staging'; END IF;
  RAISE NOTICE 'OK T2 A vê só o seu, não escreve por B, não é admin, não lê notas do staging';
END $$;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
DO $$ DECLARE n int; BEGIN
  IF (SELECT count(*) FROM public.people) <> 0 THEN RAISE EXCEPTION 'T3 falhou: B vê pessoas de A'; END IF;
  UPDATE public.people SET name = 'alterado' WHERE phone = '+999000000001'; GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'T3 falhou: B alterou pessoa de A'; END IF;
  IF (SELECT count(*) FROM public.profiles) <> 1 THEN RAISE EXCEPTION 'T3 falhou: B vê outros perfis'; END IF;
  RAISE NOTICE 'OK T3 B não vê nem altera dados de A';
END $$;

-- T4: papéis do staging preservados e sem poder V2
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000c","role":"authenticated"}', true);
DO $$ BEGIN
  IF NOT public.has_staging_access('00000000-0000-4000-8000-00000000000c') THEN RAISE EXCEPTION 'T4 falhou: tester sem acesso ao staging'; END IF;
  IF (SELECT count(*) FROM public.staging_notes) <> 3 THEN RAISE EXCEPTION 'T4 falhou: tester não lê notas'; END IF;
  IF public.is_admin('00000000-0000-4000-8000-00000000000c') THEN RAISE EXCEPTION 'T4 falhou: tester ganhou admin V2'; END IF;
  RAISE NOTICE 'OK T4 tester do staging lê notas e não é admin V2';
END $$;
RESET ROLE;

-- T5: anónimo sem acesso
SET LOCAL ROLE anon;
DO $$ BEGIN
  BEGIN PERFORM 1 FROM public.people LIMIT 1; RAISE EXCEPTION 'T5 falhou: anónimo lê pessoas';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.has_role('00000000-0000-4000-8000-00000000000a', 'admin'); RAISE EXCEPTION 'T5 falhou: anónimo executa has_role';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RAISE NOTICE 'OK T5 anónimo sem leitura nem verificação de papéis';
END $$;
RESET ROLE;

-- T6: funções atómicas usadas pelo servidor (pedido de servidor: sem utilizador na sessão)
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SET LOCAL ROLE service_role;
DO $$ DECLARE a boolean; b boolean; BEGIN
  a := public.claim_inbound_message('whatsapp', 'stg-synthetic-msg-1', 600);
  b := public.claim_inbound_message('whatsapp', 'stg-synthetic-msg-1', 600);
  IF NOT a OR b THEN RAISE EXCEPTION 'T6a falhou: claim % / %', a, b; END IF;
  a := public.reserve_unsolicited_slot('00000000-0000-4000-8000-00000000000a', current_date, 'stg', 'ref-1', 1);
  b := public.reserve_unsolicited_slot('00000000-0000-4000-8000-00000000000a', current_date, 'stg', 'ref-2', 1);
  IF NOT a OR b THEN RAISE EXCEPTION 'T6b falhou: teto % / %', a, b; END IF;
  a := public.try_acquire_conversation_lock('00000000-0000-4000-8000-00000000000a', 'account', 45, 'holder-1');
  b := public.try_acquire_conversation_lock('00000000-0000-4000-8000-00000000000a', 'account', 45, 'holder-2');
  IF NOT a OR b THEN RAISE EXCEPTION 'T6c falhou: lock % / %', a, b; END IF;
  IF public.effective_tier('00000000-0000-4000-8000-00000000000a') IS NULL THEN RAISE EXCEPTION 'T6d falhou: sem plano efetivo'; END IF;
  RAISE NOTICE 'OK T6 mensagem reclamada uma vez, teto 1/dia, lock exclusivo, plano efetivo = %', public.effective_tier('00000000-0000-4000-8000-00000000000a');
END $$;

-- T7: piloto inexistente não emite convites; escrita direta de participante rejeitada
DO $$ DECLARE r record; BEGIN
  SELECT * INTO r FROM public.issue_pilot_invite('afonso_v2', '00000000-0000-4000-8000-00000000000a', 'stg-hash-1', 'stg-idem-1', NULL, 'admin');
  IF r.out_invite_id IS NOT NULL THEN RAISE EXCEPTION 'T7 falhou: convite emitido sem piloto'; END IF;
  RAISE NOTICE 'OK T7a sem piloto: resultado = %', r.out_outcome;
EXCEPTION WHEN raise_exception OR check_violation OR foreign_key_violation OR insufficient_privilege THEN
  IF SQLERRM LIKE 'T7 falhou%' THEN RAISE; END IF;
  RAISE NOTICE 'OK T7a sem piloto: recusado (%)', SQLERRM;
END $$;
DO $$ BEGIN
  INSERT INTO public.pilot_participants (pilot_key, user_id, status, source) VALUES ('afonso_v2', '00000000-0000-4000-8000-00000000000a', 'active', 'manual');
  RAISE EXCEPTION 'T7 falhou: participante escrito diretamente';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE 'T7 falhou%' THEN RAISE; END IF;
  RAISE NOTICE 'OK T7b escrita direta de participante recusada (%)', SQLERRM;
END $$;
RESET ROLE;

ROLLBACK;
