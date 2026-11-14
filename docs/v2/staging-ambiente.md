# AFONSO 2.0 — Ambiente STAGING independente (14/11/2026)

Estado: **NÃO CRIADO.** Isolamento **não** demonstrado. G1 continua NO-GO (falta E2E).
Nada foi publicado, nenhuma flag de produção foi alterada, nenhuma mensagem saiu, nenhum dado real foi copiado.

## 1. Limites técnicos verificados (leitura apenas)

| Ponto | Evidência | Consequência |
|---|---|---|
| Projetos existentes | Lista de projetos da conta: nenhum projeto de staging do Afonso | Tem de ser criado |
| Rascunhos (drafts) | Nenhum rascunho aberto. Um rascunho recebe base de testes própria (estrutura, sem dados) **mas vive dentro deste projeto** | Segredos do rascunho = segredos de produção → **não serve como staging isolado** |
| Segredos deste projeto | 17 segredos: WhatsApp de produção (token, número, app secret), Telegram (ligação ao bot `@AfonsoAIbot`), Resend, OpenAI, Firecrawl, Google/Microsoft, `CRON_SECRET`, Stripe só sandbox | Qualquer cópia dentro do projeto herda credenciais reais |
| Stripe | Só existe chave sandbox (`STRIPE_SANDBOX_API_KEY`); não há chave live | Bom para staging, mas a conta sandbox é a mesma da V1 |
| Tarefas agendadas | 11 tarefas na base de produção (avisos, briefing, calendário, trial, etc.), criadas fora das migrações, apontam para o endereço deste projeto | Uma base nova **não** as herda — staging fica sem tarefas até serem criadas para o endereço de staging |
| Migrações históricas | 174 ficheiros; 3 referem o email do proprietário; 1 escreve no registo de auditoria texto com **2 números de telefone reais e nomes**; 1 insere um seguimento de teste com `user_id` de subconsulta (coluna NOT NULL) | Uma base nova construída por migrações pode (a) herdar esse texto real e (b) falhar nessa migração |
| Endereços fixos no código | `app.meuafonso.com` em links de mensagens, checkout e briefing | Em staging os links apontariam para produção (risco de confusão, não de escrita) |

**Conclusão:** isolamento completo só é possível com um **projeto separado** (remix), que tem backend, base de dados e segredos próprios. Eu não consigo criar esse projeto: é feito pelo proprietário na interface (menu do projeto → Remix).

## 2. O que falta (exato) — bloqueios

1. **Proprietário:** criar um remix deste projeto (ex.: “Afonso Staging”), no mesmo espaço de trabalho, com Lovable Cloud próprio. Não publicar o remix.
2. **No remix, antes de qualquer teste:** não ligar as ligações de produção (Telegram, Resend, Google, Microsoft, Firecrawl). Se o remix herdar alguma ligação, desligá-la.
3. **Telegram de teste:** criar um bot novo no @BotFather (ex.: `@AfonsoStagingBot`) e ligá-lo **só** ao remix; definir `TELEGRAM_BOT_USERNAME`.
4. **WhatsApp de teste:** na Meta, número de teste da app (ou app Meta separada) com token próprio; adicionar no remix `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_BUSINESS_ACCOUNT_ID` **de teste** e `STAGING_WHATSAPP_PHONE_NUMBER_ID` (igual ao id do número de teste). Webhook da Meta de teste aponta para o endereço do remix.
5. **Stripe:** ativar pagamentos no remix → nova conta de teste própria. Nunca ir para live.
6. **Variáveis de staging no remix:** `APP_ENV=staging`, `STAGING_APP_URL` (endereço do remix), `STAGING_ALLOWED_RECIPIENTS` (só números/chats de teste), `CRON_SECRET` novo.
7. **Email:** sem Resend de produção; usar só destinatários `@afonso-staging.invalid` (não entregáveis) ou um domínio de teste próprio.
8. **IA:** a chave Lovable AI do remix é própria; `OPENAI_API_KEY` não deve ser copiada (fallback desligado ou chave de teste).

Sem estes passos, qualquer teste “de staging” seria uma simulação de isolamento — não foi feito.

## 3. Preparado neste projeto (seguro, sem efeito na V1)

- `src/lib/staging/staging-env.ts` — verificação de isolamento (`checkStagingIsolation`): backend ≠ produção, sem Stripe live, bot Telegram ≠ `@AfonsoAIbot`, número WhatsApp de teste declarado (confirmação manual na Meta), destinatários restritos, endereço ≠ produção. `isStagingRecipientAllowed` devolve sempre *true* fora de staging (V1 inalterada). **Ainda não está ligado aos envios**; ligar é o primeiro passo no remix.
- `src/lib/staging/synthetic-fixtures.ts` — dados fictícios (3 consultores, 9 clientes, 9 imóveis): emails `.invalid`, telefones no indicativo 999 (não atribuído), chat ids fora da gama real; validação que rejeita números PT reais.
- `STAGING_DB_PREFLIGHT_SQL` — barreira na base: aborta se existir qualquer conta não sintética (na produção recusa sempre). `STAGING_SANITIZE_SQL` — remove do staging os registos de auditoria herdados das migrações, só depois da barreira.
- Testes: `src/lib/staging/staging-env.test.ts` (11 testes, verdes) — incluindo “o backend atual nunca passa como staging”.

## 4. Provas

- Isolamento DB: **não demonstrado** (não existe base de staging).
- Isolamento de segredos: **não demonstrado** (não existem segredos de staging).
- `checkStagingIsolation` com as variáveis deste projeto: falha `app_env` e `backend_separado` (teste unitário equivalente).
- Testes executados: apenas unitários; nenhum E2E.

## 5. Riscos

1. Remix pode herdar ligações da área de trabalho (Telegram/Resend) → enviar pelo bot de produção. Mitigação: passo 2–3 e verificação `telegram_bot_teste`.
2. Migração histórica com telefones reais no texto de auditoria → limpeza `STAGING_SANITIZE_SQL` após preflight; correção do ficheiro histórico exige autorização própria.
3. Migração do seguimento de teste pode falhar numa base nova → se falhar, corrigir no remix (não na produção).
4. Links fixos `app.meuafonso.com` em mensagens de staging → parametrizar por `STAGING_APP_URL` no remix.
5. Stripe sandbox da V1 é partilhado se o remix reutilizar a chave → criar pagamentos novos no remix.

## 6. Próximos passos (por ordem)

1. Proprietário cria o remix e as credenciais de teste (secção 2).
2. No remix: ligar `isStagingRecipientAllowed` aos envios WhatsApp/Telegram/email e expor `checkStagingIsolation` na consola admin do staging.
3. Correr preflight + limpeza; criar 3 contas sintéticas; carregar dados sintéticos.
4. Correr no staging: `test:isolation` (com `TEST_SUPABASE_*` do staging), E2E WhatsApp/Telegram com número/bot de teste, webhooks Stripe de teste fora de ordem.
5. Só com esses resultados reavaliar G1; GO exige ainda autorização expressa do proprietário.
