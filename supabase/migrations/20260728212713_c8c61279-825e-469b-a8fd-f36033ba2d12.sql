INSERT INTO public.assistant_golden_conversations (slug, title, description, turns, tags) VALUES
('greeting-bom-dia', 'Saudação simples', 'Consultor diz bom dia; assessor deve reconhecer sem executar nada.',
 '[{"user":"Bom dia","expect":{"action":"acknowledge","must_not_contain":["Feito","payload","backend"]}}]'::jsonb,
 ARRAY['cultura','saudacao']),
('short-answer-sim', 'Confirmação curta', 'Resposta "sim" sem contexto pendente não deve inventar ação.',
 '[{"user":"sim","expect":{"action":"acknowledge","must_not_contain":["Feito","criado","registei"]}}]'::jsonb,
 ARRAY['cultura','short-answer']),
('agenda-hoje', 'Pergunta pela agenda', 'Consultor pergunta o que tem hoje; assessor deve reconhecer intenção de consulta.',
 '[{"user":"O que tenho hoje?","expect":{"action":"act","tool":"agenda_today","reply_contains":[]}}]'::jsonb,
 ARRAY['agenda'])
ON CONFLICT (slug) DO UPDATE SET turns = EXCLUDED.turns, description = EXCLUDED.description, updated_at = now();