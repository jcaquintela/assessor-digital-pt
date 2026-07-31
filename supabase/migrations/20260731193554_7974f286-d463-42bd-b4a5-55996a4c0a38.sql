UPDATE public.assistant_golden_conversations
SET turns = '[
  {"user": "lembra-me de ligar ao Miguel {{HORA+2}}", "expect": {"tool": "create_follow_up", "action": "act"}},
  {"user": "afinal passa para as {{H+3}}", "expect": {"action": "act"}},
  {"user": "melhor às {{H+4}}", "expect": {"action": "act", "must_not_contain": ["criei outro", "novo seguimento"]}}
]'::jsonb,
    updated_at = now()
WHERE slug = 'reagendamento-repetido';

UPDATE public.assistant_golden_conversations
SET turns = '[
  {"user": "marca reunião com o Pedro amanhã às 10h, e um script para a chamada também", "expect": {"reply_contains": ["script"], "must_not_contain": ["não percebi"]}}
]'::jsonb,
    updated_at = now()
WHERE slug = 'multiplos-pedidos';