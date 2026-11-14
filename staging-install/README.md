# Instalação futura da V2 no AFONSO Staging — pacote de preparação

**Estado: só preparação. Nada daqui foi executado.** Não há ligação a nenhuma base de dados, não foram aplicadas migrações (nem aqui nem no staging), não há integrações, envios, webhooks, tarefas agendadas nem interruptores ligados. G1–G4 continuam NO-GO.

> Estes ficheiros **nunca** se aplicam a este projeto (produção/V1). Destino único: projeto AFONSO Staging (`8d741542-70d9-4078-bfc6-64e3d047396a`), com backend próprio.

## Conteúdo

| Caminho | O quê |
|---|---|
| `migrations/S2-00_staging_roles_prelude.sql` | Conserva os papéis do staging (`admin`, `tester`), as linhas de `user_roles` e `has_staging_access`; acrescenta os valores V2 (`consultant`, `support_admin`, `super_admin`) e a coluna `created_by`. Transação própria |
| `migrations/S2-01_v2_schema_part1.sql` | História V2 limpa, parte 1 (121 ficheiros de origem), até ao `ALTER TYPE deal_stage ADD VALUE 'perdido'` |
| `migrations/S2-02_v2_schema_part2.sql` | História V2 limpa, parte 2 (54 ficheiros, incluindo as 10 migrações V2/piloto) |
| `migrations/S2-99_staging_safety_checks.sql` | Desliga todos os interruptores e aborta se houver ativações individuais, pilotos/participantes, administradores V2 ou se os papéis do staging tiverem desaparecido |
| `migrations/manifest.json` | Contagens, sha256 de cada bloco, ficheiros excluídos e partes retiradas, com motivo |
| `SECURITY-DEPENDENCIES.md` | Vulnerabilidades das bibliotecas (sem atualizações) |

## Como se gera (reprodutível)

```
bun scripts/staging/build-staging-schema.ts
```

- Lê `supabase/migrations/*.sql` por data e `drizzle/migrations` pela ordem do journal (184 ficheiros).
- Aplica `src/lib/staging/schema-rules.ts`. Cada regra fixa o sha256 do ficheiro revisto: se a origem mudar, a montagem **falha** até a regra ser revista.
- Corta um bloco depois de cada `ALTER TYPE … ADD VALUE`, porque o valor novo só pode ser usado noutra transação.
- Pesquisa o resultado: identificadores (UUID), emails, telefones PT, `meuafonso.com`, id do projeto e backend de produção, bot de produção, `cron`/`net.http`/`vault`, linhas de buckets, fusões de contas, ativações individuais, `BEGIN/COMMIT`. **Com 1 ocorrência ou mais, não escreve nada.** Resultado atual: 0.
- O teste `src/lib/staging/schema-builder.test.ts` repete a montagem e confirma que os ficheiros guardados são idênticos.

## O que fica de fora (e porquê)

**Excluídos (9 ficheiros):**
- administrador fixo (`super_admin` para um identificador de produção);
- fixture de teste ligada ao email do proprietário, e o ficheiro que a apaga;
- 6 correções/limpezas de linhas de produção por identificador ou texto.

**Partes retiradas (5 ficheiros, a estrutura mantém-se):**
- fusão de 2 pares de contas reais e o registo de auditoria com 2 telefones e 2 nomes reais. A função de fusão continua;
- 2 ativações individuais de interruptores pelo email do proprietário;
- conclusão de 2 seguimentos de produção. A novidade do produto no mesmo ficheiro continua;
- piloto e participantes com 5 identificadores reais. As tabelas, funções e guardas continuam; o staging recebe um piloto sintético no passo S5.

**Mantido e revisto:** as restantes atualizações de dados são preenchimentos genéricos (sem identificadores) e não fazem nada numa base vazia. As sementes de configuração (`product_updates`, conversas de referência sintéticas, `plan_configs`, taxas, `app_settings`) não têm dados pessoais. Os interruptores que a história semeava ligados (por exemplo, motores v2/v3 e o template de check-in) ficam desligados pelo S2-99.

## Ordem de instalação no staging (cada passo exige autorização expressa)

1. **S1 · credenciais de teste próprias**, nunca copiadas da produção:
   - `APP_ENV=staging` e `STAGING_APP_URL=<endereço do staging>`;
   - `VITE_APP_ENV=staging` e `VITE_STAGING_APP_URL`, para o navegador;
   - `STAGING_EMAIL_FROM`, num domínio de teste;
   - `TELEGRAM_BOT_USERNAME`, para um bot novo;
   - número Meta de teste e `STAGING_WHATSAPP_PHONE_NUMBER_ID`;
   - `STAGING_ALLOWED_RECIPIENTS`;
   - `CRON_SECRET` e `APP_USER_CONNECTION_KEY_SECRET` novos;
   - pagamentos só em modo de teste.

   Sem ligações da área de trabalho da produção (Telegram, Resend, Firecrawl).
2. **Extensões:** `pgcrypto`, `uuid-ossp`, `unaccent` (schema `extensions`). Não são precisas `pg_cron`/`pg_net` para o esquema.
3. **S2:** aplicar `S2-00`, `S2-01`, `S2-02` e `S2-99` pela ordem, **um ficheiro por migração**, com a ferramenta de migrações do próprio staging. Se uma falhar, nada dessa migração fica aplicado.
4. **Bucket `assessor-files` (privado):** criar com a ferramenta de armazenamento do staging, não por SQL. As políticas já vêm no S2-01.
5. **S3–S5:**
   - copiar o código;
   - confirmar que `checkStagingIsolation` passa;
   - carregar só os dados sintéticos (`STAGING_DB_PREFLIGHT_SQL` + `synthetic-fixtures.ts`).
6. **S6 · tarefas agendadas:** criar de raiz para o endereço do staging, com o `CRON_SECRET` novo, e começar desligadas. Nunca copiar `cron.job` da produção: lá o segredo está escrito no texto de cada tarefa.
7. **S7–S8:** os 14 testes da auditoria e a revisão de segurança.

**Nunca copiar:**
- dados de produção, `auth.users`, `storage.objects`;
- `cron.job`, `vault`, tokens OAuth, `app_user_connections`;
- registos de auditoria ou logs.

## Endereços por ambiente (código)

`src/lib/env/app-url.ts` é a fonte única do endereço da app, do painel, dos domínios próprios, do remetente de email e do bot de Telegram.

**Sem `APP_ENV=staging`:** devolve exatamente os valores atuais da produção, e a V1 não muda.

**Com `APP_ENV=staging`:** nunca devolve `app.meuafonso.com`, `ola@meuafonso.com` nem `@AfonsoAIbot`. Se faltar configuração, falha em vez de usar a produção. Isto aplica-se a:
- links de entrada;
- links de avisos e de propostas;
- template Meta do briefing;
- pré-visualização de convites;
- regresso do checkout;
- validação de links próprios;
- remetente de email;
- link do bot.

## Limites conhecidos (não verificado)

- **Execução:** foi aplicado sem erros numa base PostgreSQL 17 descartável e isolada (ver `rehearsal/README.md`), mas ainda não no staging. A plataforma (autenticação, ficheiros, Realtime) foi simulada.
- **Objetos criados à mão:** podem existir na produção objetos criados fora das migrações, que faltariam no staging. Uma comparação de esquema exige ler a produção, fora deste pedido.
- **Previews de admin:** ainda mostram "ola@meuafonso.com" como texto fixo (`admin/comunicacao.tsx`, `daily-digest.tsx`, `name-preview.ts`). Não enviam nada.
- **Lista de destinatários:** os 21 módulos de envio ainda não consultam `isStagingRecipientAllowed`. Isto é obrigatório antes de qualquer envio no staging.
