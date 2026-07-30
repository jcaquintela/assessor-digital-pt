CREATE TABLE IF NOT EXISTS public.conversation_locks (
  user_id uuid NOT NULL,
  channel text NOT NULL,
  locked_until timestamptz NOT NULL,
  holder text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, channel)
);

GRANT ALL ON public.conversation_locks TO service_role;

ALTER TABLE public.conversation_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conversation_locks_owner_read" ON public.conversation_locks
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.try_acquire_conversation_lock(
  _user_id uuid, _channel text, _ttl_seconds integer DEFAULT 60, _holder text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

CREATE OR REPLACE FUNCTION public.release_conversation_lock(
  _user_id uuid, _channel text, _holder text DEFAULT NULL
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.conversation_locks
     SET locked_until = now() - interval '1 second'
   WHERE user_id = _user_id AND channel = _channel
     AND (_holder IS NULL OR holder = _holder);
$$;

REVOKE ALL ON FUNCTION public.try_acquire_conversation_lock(uuid, text, integer, text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_conversation_lock(uuid, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.try_acquire_conversation_lock(uuid, text, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_conversation_lock(uuid, text, text) TO service_role;