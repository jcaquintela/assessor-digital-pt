# Auditoria técnica (só leitura) — Afonso AI

Nada foi alterado. Legenda: **[C]** confirmado no código · **[CNT]** configurado mas não testado ponta-a-ponta nesta auditoria · **[NI]** não implementado · **[D]** desconhecido.

## 1. Arquitetura
- [C] TanStack Start (React 19, Vite 7) em Cloudflare Workers; backend Lovable Cloud (Postgres + Auth + Storage); 174 migrações.
- [C] Motor "Reasoning Engine v3" (Observe→Think→Search→Decide→Act→Remember→Reply) em `src/lib/assessor/v3`, com router determinístico antes do LLM; ativo por feature flag por utilizador.
- [C] Channel Gateway único (`channel-gateway/ingest.server.ts`) com adaptadores WhatsApp e Telegram.

## 2. Inconsistências com "WhatsApp-only"
- [C] Existe app web completa para o consultor: 41 páginas autenticadas (`/hoje`, `/assessor`, `/calendario`, `/drive`, `/imoveis`, `/comunicacao`, `/definicoes`...), registo, login, recuperação de password, planos.
- [C] Canal Telegram completo e paralelo (webhook, onboarding, "Telegram Grátis"), contrário a WhatsApp-only.
- [C] Chat do dashboard (`dashboard-chat.functions.ts`) — segunda interface conversacional.
- [C] Servidor MCP (`/mcp`, OAuth consent) — terceira interface.
- [C] Memória do projeto ainda afirma "Dashboard cria Pessoas e Imóveis" — contradiz a premissa.
- [C] Painel `/admin` (~38 páginas) — legítimo, só equipa.

## 3. WhatsApp
- [C] Fornecedor: Meta Cloud API **direta** (`graph.facebook.com/v20.0` em `whatsapp/send.server.ts`), não o conector Lovable. Webhook `/api/public/whatsapp-webhook` com verificação HMAC `x-hub-signature-256` em tempo constante e verify token.
- [C] Tipos: texto, áudio, imagem, documento, botões, reações, cartões de contacto.
- [C] Templates (briefing, check-in, plano ativado, trial) com parâmetros achatados; estado de templates por hook.
- [CNT] Estados de entrega (sent/delivered/read) — registados em `whatsapp_send_logs`; reconciliação completa não verificada.
- [D] Se há inbox duradoura e idempotência por id de entrega antes de processar (risco de perder mensagens se o processamento falhar).
- [NI] Fallback quando um template é rejeitado (a mensagem perde-se, só log).

## 4. Autenticação e identidade
- [C] Auth por email/password + ligação de canal por código (`whatsapp_link_codes`, `telegram_link_tokens`); tokens de login por link (`dashboard_login_tokens`).
- [C] Papéis em `user_roles` com `has_role`/`is_admin` (security definer). MFA admin (`admin_mfa_required`).
- [D] Comportamento de um número WhatsApp desconhecido (registo automático vs. recusa) — merece verificação dedicada.

## 5. Base de dados e RLS
- [C] ~95 tabelas, todas com RLS e pelo menos 1 política; dados por `user_id`.
- [C] Linter: 1 extensão no esquema público; 3 funções security definer executáveis por qualquer utilizador autenticado (candidatas: `merge_accounts_apply/preview`, `purge_admin_audit_logs`, `expire_beta_testers` — **[D]** quais exatamente; se forem estas, é crítico).
- [C] Escritas só por Domain Services (IA nunca escreve diretamente).

## 6. LLM, prompts e memória
- [C] Gemini `google/gemini-3.6-flash` via AI Gateway (think, decide, áudio, correções). Telemetria em `assessor_ai_logs`, traces, AQS/ATS.
- [C] Proteção contra extração do system prompt (`prompt-shield.ts`) + bloco de confidencialidade; notas confidenciais filtradas (`dropConfidential`).
- [C] Memória: `conversation_states`, `memory.server.ts`, correções do utilizador, reflexões.
- [C] Salvaguarda "não dizer fica anotado sem escrita" (`write-receipt.ts`).
- [D] Custos por consultor/mês e limites de tokens.

## 7. Tarefas, lembretes, rotinas, calendário
- [C] `follow_ups`, `reminders`, `routines` (ocorrência substituída pela seguinte), prazos de negócio, avisos por caminho único `assessor_nudges` com expiração e texto recalculado no envio; horário 9h–20h sem domingos.
- [C] Google Calendar e Outlook com sincronização por polling, chaves cifradas, deteção de conflitos.
- [CNT] Rotinas da Iolanda ainda não passadas para quinta-feira (espera resposta dela).

## 8. OCR / ficheiros / integrações
- [C] Leitura de imagem por LLM com visão (cartões de visita, documentos), Drive com quotas mensais, Storage com isolamento.
- [C] Firecrawl (imóveis semelhantes, com guardrails de linguagem); email Gmail (envio) / Outlook (rascunho) / Resend.
- [NI] OCR dedicado (não há motor OCR próprio; depende do LLM).

## 9. Jobs e notificações
- [C] 14 hooks públicos (proactive-tick, push, daily-digest, meeting-briefing, calendar-poll, trial/beta lifecycle...), protegidos por `requireCronSecret`.
- [C] Comentário desatualizado em `proactive-tick.ts` diz "autenticado com chave anon" — o código usa segredo próprio.
- [D] Frequência real e monitorização de falhas dos crons.

## 10. Billing
- [C] Stripe com webhook verificado (`verifyWebhook`), eventos idempotentes (`stripe_webhook_events`), tiers via `effective_tier()`, códigos promocionais, trial.
- [CNT] Pagamento real em produção não testado nesta auditoria.

## 11. Logs e testes
- [C] 263 ficheiros de teste (vitest, ~1900 testes, golden tests), 9 specs Playwright (todas sobre a app web).
- [C] Teste de isolamento de Storage com timeout recorrente (instável).
- [NI] Testes ponta-a-ponta do fluxo WhatsApp real (webhook assinado → resposta).

## Pontos críticos de segurança
1. Funções security definer chamáveis por qualquer utilizador autenticado (linter).
2. Superfícies extra expostas (web, Telegram, MCP, chat do dashboard) aumentam a área de ataque face ao produto declarado.
3. Webhook WhatsApp processa sem inbox duradoura confirmada → perdas silenciosas.
4. Hooks públicos dependem de um único segredo partilhado — confirmar rotação e que nenhum hook ficou sem `requireCronSecret`.
5. Registo automático por número desconhecido no canal (verificar abuso / custos de LLM).

## 10 prioridades (ordenadas)
1. Rever as 3 funções security definer e retirar execução a utilizadores comuns.
2. Decisão de produto: desligar/limitar a app web do consultor, chat do dashboard e MCP, ou atualizar a premissa WhatsApp-only.
3. Decidir o futuro do Telegram (manter como canal ou retirar).
4. Inbox duradoura e idempotente para o webhook WhatsApp com recuperação de falhas.
5. Fallback quando um template WhatsApp é rejeitado (ex.: texto livre se dentro de 24h, alerta à equipa).
6. Teste ponta-a-ponta do fluxo WhatsApp (assinatura, ingest, resposta, estados).
7. Fechar o caso da Iolanda (rotinas para quinta) e publicar as correções pendentes já testadas.
8. Monitorização dos crons (alerta quando um job falha ou não corre).
9. Controlo de custos de LLM por consultor e limite de mensagens.
10. Estabilizar o teste instável de Storage e limpar comentários/memórias desatualizados.

## Nota
Esta auditoria não executa nenhuma alteração. Aprovar este documento só serve para o arquivar; cada prioridade seria um pedido separado.
