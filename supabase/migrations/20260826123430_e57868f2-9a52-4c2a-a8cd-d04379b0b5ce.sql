ALTER TABLE public.email_drafts
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'reply',
  ADD COLUMN IF NOT EXISTS person_id uuid REFERENCES public.people(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS email_drafts_person_idx ON public.email_drafts (user_id, person_id);

CREATE OR REPLACE FUNCTION public.email_drafts_validate()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
$function$;