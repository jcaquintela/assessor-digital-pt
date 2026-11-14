-- Correções pré-piloto (após Fase 2). Só acrescentos; cada parte tem
-- interruptor próprio em feature_flags e, desligado, nada disto é lido.

-- (1) Teto global de intervenções NÃO solicitadas por conta/dia ------------
CREATE TABLE IF NOT EXISTS public.proactive_daily_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  day date NOT NULL,
  source text NOT NULL,
  ref_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, day, ref_key)
);
COMMENT ON TABLE public.proactive_daily_ledger IS 'Vaga diária (dia de Lisboa) de intervenções não solicitadas, partilhada por todos os emissores proativos.';

GRANT SELECT ON public.proactive_daily_ledger TO authenticated;
GRANT ALL ON public.proactive_daily_ledger TO service_role;
ALTER TABLE public.proactive_daily_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Consultor vê as suas vagas" ON public.proactive_daily_ledger
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.reserve_unsolicited_slot(
  _user_id uuid, _day date, _source text, _ref_key text, _cap integer DEFAULT 1
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
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

CREATE OR REPLACE FUNCTION public.release_unsolicited_slot(
  _user_id uuid, _day date, _ref_key text
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  DELETE FROM public.proactive_daily_ledger
   WHERE user_id = _user_id AND day = _day AND ref_key = _ref_key;
$$;

REVOKE ALL ON FUNCTION public.reserve_unsolicited_slot(uuid, date, text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_unsolicited_slot(uuid, date, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_unsolicited_slot(uuid, date, text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_unsolicited_slot(uuid, date, text) TO service_role;

-- Notificações explicitamente ativadas pelo consultor.
ALTER TABLE public.consultant_preferences
  ADD COLUMN IF NOT EXISTS explicit_opt_ins text[] NOT NULL DEFAULT '{}'::text[];
COMMENT ON COLUMN public.consultant_preferences.explicit_opt_ins IS 'Notificações que o consultor ligou explicitamente (morning_briefing, evening_review, push). Ligado por defeito não conta.';

-- Backfill: proactive_push_enabled é desligado por defeito, por isso estar
-- ligado é prova de ativação explícita.
UPDATE public.consultant_preferences
   SET explicit_opt_ins = ARRAY['push']::text[]
 WHERE proactive_push_enabled IS TRUE
   AND NOT ('push' = ANY(explicit_opt_ins));

CREATE OR REPLACE FUNCTION public.consultant_preferences_track_opt_ins()
RETURNS trigger
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

DROP TRIGGER IF EXISTS consultant_preferences_track_opt_ins ON public.consultant_preferences;
CREATE TRIGGER consultant_preferences_track_opt_ins
  BEFORE INSERT OR UPDATE ON public.consultant_preferences
  FOR EACH ROW EXECUTE FUNCTION public.consultant_preferences_track_opt_ins();

-- (2) Mensagens adiadas por falta de lock (conversa partilhada) ------------
CREATE INDEX IF NOT EXISTS assessor_messages_deferred_lock_idx
  ON public.assessor_messages (created_at)
  WHERE status = 'deferred_lock';

-- (3) Ligação segura de um canal já associado a outra conta ----------------
ALTER TABLE public.telegram_pairings
  ADD COLUMN IF NOT EXISTS source_user_id uuid;
COMMENT ON COLUMN public.telegram_pairings.source_user_id IS 'Conta atual deste chat quando o consultor pede para o ligar a outra conta (nunca há fusão automática).';