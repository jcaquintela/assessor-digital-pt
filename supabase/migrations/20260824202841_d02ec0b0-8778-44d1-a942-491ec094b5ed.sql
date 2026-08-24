ALTER TABLE public.conversation_states
  ADD COLUMN IF NOT EXISTS last_read_tool text,
  ADD COLUMN IF NOT EXISTS last_read_args jsonb,
  ADD COLUMN IF NOT EXISTS last_read_axis text,
  ADD COLUMN IF NOT EXISTS last_read_at timestamptz;

ALTER TABLE public.conversation_states
  DROP CONSTRAINT IF EXISTS conversation_states_last_read_axis_check;

ALTER TABLE public.conversation_states
  ADD CONSTRAINT conversation_states_last_read_axis_check
  CHECK (last_read_axis IS NULL OR last_read_axis IN ('time', 'none'));