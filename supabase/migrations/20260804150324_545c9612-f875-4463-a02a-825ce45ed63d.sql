insert into public.follow_ups (user_id, person_id, title, type, due_date, due_time, status)
values (
  (select id from public.profiles where email='julio.quintela@saguii.com'),
  '9fe4f70e-1723-4ffc-a0f0-7237ff3de9ad',
  'TESTE briefing — visita com Ana Silva',
  'visita',
  current_date,
  '23:30',
  'pendente'
);