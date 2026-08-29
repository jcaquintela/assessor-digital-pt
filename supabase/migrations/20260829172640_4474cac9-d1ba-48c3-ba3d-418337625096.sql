ALTER TABLE public.follow_ups ADD COLUMN IF NOT EXISTS duration_minutes integer;

COMMENT ON COLUMN public.follow_ups.duration_minutes IS 'Duração real do compromisso em minutos (vinda do calendário externo). NULL = desconhecida, assume-se 60.';