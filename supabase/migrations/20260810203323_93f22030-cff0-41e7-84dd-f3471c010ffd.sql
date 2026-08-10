CREATE TABLE public.admin_messages (
  id uuid primary key default gen_random_uuid(),
  consultor_id uuid not null references public.profiles(id) on delete cascade,
  admin_id uuid not null references public.profiles(id) on delete cascade,
  pergunta text not null,
  enviado_em timestamptz not null default now(),
  resposta text,
  respondido_em timestamptz,
  estado text not null default 'pendente',
  janela_expira_em timestamptz not null default (now() + interval '48 hours'),
  resposta_lida_em timestamptz,
  created_at timestamptz not null default now()
);

CREATE INDEX admin_messages_consultor_estado_idx
  ON public.admin_messages (consultor_id, estado, janela_expira_em DESC);

GRANT ALL ON public.admin_messages TO service_role;

ALTER TABLE public.admin_messages ENABLE ROW LEVEL SECURITY;