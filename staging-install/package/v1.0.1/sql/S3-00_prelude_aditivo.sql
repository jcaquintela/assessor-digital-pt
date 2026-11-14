-- S3-00 · prelúdio aditivo
-- AFONSO V2 · pacote de instalação v1.0.1 · destino ÚNICO: AFONSO Staging.
-- Gerado por scripts/staging/build-staging-package-v101.ts a partir do estado final do esquema
-- (staging-install/rehearsal/results/schema_public.sql, sha256 e047c2e1fe0effb5…).
-- Só DDL aditivo: sem INSERT/UPDATE/DELETE, sem DROP, sem RENAME, sem DROP NOT NULL, sem instruções SET de sessão.
-- NÃO EXECUTAR na V1 (produção). Aplicar só com autorização, por ordem, um ficheiro por migração.
-- Novos valores de app_role (transação própria), extensão unaccent e user_roles.created_by (nulo, sem chave para auth.users). Não muda linhas, políticas nem permissões do staging.

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'consultant';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'support_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS created_by uuid;
