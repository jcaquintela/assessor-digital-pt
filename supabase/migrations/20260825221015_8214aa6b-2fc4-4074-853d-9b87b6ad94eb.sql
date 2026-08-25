ALTER TABLE public.email_drafts
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

CREATE OR REPLACE FUNCTION public.email_drafts_validate()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status NOT IN ('pending','confirmed','discarded','sent','cancelled') THEN
    RAISE EXCEPTION 'estado de rascunho inválido: %', NEW.status;
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