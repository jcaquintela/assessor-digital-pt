UPDATE public.assistant_golden_conversations
SET turns = '[{"user":"O que tenho hoje?","expect":{"action":"act","tool":"search_agenda","must_not_contain":["diversos","feito","registei"]}}]'::jsonb,
    description = 'Consultor pergunta pela agenda de hoje; assessor chama search_agenda e devolve dados reais.',
    updated_at = now()
WHERE slug = 'agenda-hoje';

UPDATE public.assistant_golden_conversations
SET turns = '[{"user":"sim","expect":{"action":"ask","reply_contains":["a que te referes"],"must_not_contain":["feito","criado","registei","registado","marquei"]}}]'::jsonb,
    description = 'Confirmação curta sem contexto pendente pede referência, não executa tools.',
    updated_at = now()
WHERE slug = 'short-answer-sim';

INSERT INTO public.assistant_golden_conversations (slug, title, description, turns, tags) VALUES
  ('agenda-que-tenho-hoje','Agenda: Que tenho hoje?','Variante interrogativa curta.',
   '[{"user":"Que tenho hoje?","expect":{"action":"act","tool":"search_agenda"}}]'::jsonb, ARRAY['agenda']),
  ('agenda-marcado-hoje','Agenda: marcado para hoje','Variante "o que está marcado para hoje".',
   '[{"user":"O que está marcado para hoje?","expect":{"action":"act","tool":"search_agenda"}}]'::jsonb, ARRAY['agenda']),
  ('agenda-alguma-coisa-hoje','Agenda: alguma coisa hoje','Variante "tenho alguma coisa hoje".',
   '[{"user":"Tenho alguma coisa hoje?","expect":{"action":"act","tool":"search_agenda"}}]'::jsonb, ARRAY['agenda']),
  ('agenda-como-esta','Agenda: como está a minha agenda','Variante genérica com palavra "agenda".',
   '[{"user":"Como está a minha agenda?","expect":{"action":"act","tool":"search_agenda"}}]'::jsonb, ARRAY['agenda']),
  ('agenda-e-hoje','Agenda: e hoje?','Variante ultra-curta "E hoje?".',
   '[{"user":"E hoje?","expect":{"action":"act","tool":"search_agenda"}}]'::jsonb, ARRAY['agenda'])
ON CONFLICT (slug) DO UPDATE SET turns = EXCLUDED.turns, description = EXCLUDED.description, updated_at = now();