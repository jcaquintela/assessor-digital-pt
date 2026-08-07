create extension if not exists unaccent with schema extensions;

create or replace function public.text_norm(_t text)
returns text
language sql
immutable
parallel safe
set search_path = public, extensions
as $$ select lower(extensions.unaccent('extensions.unaccent', coalesce(_t, ''))) $$;

alter table public.people
  add column if not exists name_norm text generated always as (public.text_norm(name)) stored;
create index if not exists people_name_norm_idx on public.people (name_norm text_pattern_ops);

alter table public.properties
  add column if not exists search_norm text generated always as (
    public.text_norm(coalesce(title,'') || ' ' || coalesce(location,'') || ' ' || coalesce(city,'') || ' ' || coalesce(address,''))
  ) stored;
create index if not exists properties_search_norm_idx on public.properties (search_norm text_pattern_ops);

alter table public.miscellaneous_items
  add column if not exists title_norm text generated always as (public.text_norm(title)) stored;

alter table public.follow_ups
  add column if not exists title_norm text generated always as (public.text_norm(title)) stored;

alter table public.prospecting_leads
  add column if not exists search_norm text generated always as (
    public.text_norm(coalesce(title,'') || ' ' || coalesce(location,'') || ' ' || coalesce(address,''))
  ) stored;

alter table public.uploaded_files
  add column if not exists search_norm text generated always as (
    public.text_norm(coalesce(original_file_name,'') || ' ' || coalesce(ai_summary,'') || ' ' || coalesce(document_type,'') || ' ' || coalesce(doc_morada,''))
  ) stored;