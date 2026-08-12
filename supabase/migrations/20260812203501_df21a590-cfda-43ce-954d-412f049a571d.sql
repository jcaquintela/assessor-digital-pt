-- 1) reminders -> follow_ups (relação polimórfica passa a ter coluna dedicada + FK)
ALTER TABLE public.reminders
  ADD COLUMN IF NOT EXISTS follow_up_id uuid;

UPDATE public.reminders r
   SET follow_up_id = r.related_resource_id
  FROM public.follow_ups f
 WHERE r.related_resource_type = 'follow_up'
   AND f.id = r.related_resource_id
   AND r.follow_up_id IS DISTINCT FROM r.related_resource_id;

ALTER TABLE public.reminders
  DROP CONSTRAINT IF EXISTS reminders_follow_up_id_fkey;
ALTER TABLE public.reminders
  ADD CONSTRAINT reminders_follow_up_id_fkey
  FOREIGN KEY (follow_up_id) REFERENCES public.follow_ups(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS reminders_follow_up_id_idx ON public.reminders(follow_up_id);

-- Mantém follow_up_id sincronizado com o par polimórfico, sem exigir alterações ao código.
CREATE OR REPLACE FUNCTION public.reminders_sync_follow_up_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
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

DROP TRIGGER IF EXISTS reminders_sync_follow_up_id_trg ON public.reminders;
CREATE TRIGGER reminders_sync_follow_up_id_trg
  BEFORE INSERT OR UPDATE OF related_resource_type, related_resource_id ON public.reminders
  FOR EACH ROW EXECUTE FUNCTION public.reminders_sync_follow_up_id();

-- 2) user_id -> auth.users nas tabelas que ainda não tinham FK
ALTER TABLE public.app_user_connection_aliases ADD CONSTRAINT app_user_connection_aliases_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.app_user_connections ADD CONSTRAINT app_user_connections_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.assistant_reflections ADD CONSTRAINT assistant_reflections_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.assistant_shadow_runs ADD CONSTRAINT assistant_shadow_runs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.assistant_trust_scores ADD CONSTRAINT assistant_trust_scores_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.assistant_user_corrections ADD CONSTRAINT assistant_user_corrections_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.calendar_event_links ADD CONSTRAINT calendar_event_links_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.calendar_sync_log ADD CONSTRAINT calendar_sync_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.calendar_sync_state ADD CONSTRAINT calendar_sync_state_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.content_access_consents ADD CONSTRAINT content_access_consents_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.entity_tags ADD CONSTRAINT entity_tags_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.file_categories ADD CONSTRAINT file_categories_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.file_links ADD CONSTRAINT file_links_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.folder_items ADD CONSTRAINT folder_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.folders ADD CONSTRAINT folders_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.opportunity_events ADD CONSTRAINT opportunity_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.opportunity_properties ADD CONSTRAINT opportunity_properties_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.person_phones ADD CONSTRAINT person_phones_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.property_interests ADD CONSTRAINT property_interests_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.property_marketing_activities ADD CONSTRAINT property_marketing_activities_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.property_offers ADD CONSTRAINT property_offers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.routines ADD CONSTRAINT routines_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.tags ADD CONSTRAINT tags_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Tabelas com registos históricos cujo dono já não existe: validar só daqui para a frente.
ALTER TABLE public.assessor_ai_logs ADD CONSTRAINT assessor_ai_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE public.conversation_locks ADD CONSTRAINT conversation_locks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE public.property_categories ADD CONSTRAINT property_categories_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;

-- Índices para as FKs novas mais consultadas
CREATE INDEX IF NOT EXISTS entity_tags_user_id_idx ON public.entity_tags(user_id);
CREATE INDEX IF NOT EXISTS folder_items_user_id_idx ON public.folder_items(user_id);
CREATE INDEX IF NOT EXISTS file_links_user_id_idx ON public.file_links(user_id);
CREATE INDEX IF NOT EXISTS person_phones_user_id_idx ON public.person_phones(user_id);