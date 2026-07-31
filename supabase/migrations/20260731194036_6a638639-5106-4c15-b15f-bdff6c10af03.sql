UPDATE public.assistant_golden_conversations
SET turns = '[
  {"user": "marca reunião com o Pedro amanhã às 10h, e um script para a chamada também", "expect": {"reply_contains": ["guião|guiao|script"], "must_not_contain": ["não percebi"]}}
]'::jsonb,
    updated_at = now()
WHERE slug = 'multiplos-pedidos';