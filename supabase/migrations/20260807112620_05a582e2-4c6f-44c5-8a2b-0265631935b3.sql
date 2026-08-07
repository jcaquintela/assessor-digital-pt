alter table public.opportunities
  add column if not exists title_norm text generated always as (public.text_norm(title)) stored;