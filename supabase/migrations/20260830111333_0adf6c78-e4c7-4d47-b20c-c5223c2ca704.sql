ALTER TABLE public.consultant_preferences
  ALTER COLUMN evening_wrap_enabled SET DEFAULT true;

UPDATE public.consultant_preferences SET evening_wrap_enabled = true WHERE evening_wrap_enabled = false;

INSERT INTO public.product_updates (released_on, title, description, category, is_published)
VALUES (
  current_date,
  'Resumo de fim de dia',
  'Ao fim do dia (19h) passas a receber um fecho do dia: o que aconteceu, o que ficou por fechar e o que te espera amanhã. Podes pedi-lo a qualquer hora com "como correu o dia?" ou "resumo do dia".',
  'nova_funcionalidade',
  true
);