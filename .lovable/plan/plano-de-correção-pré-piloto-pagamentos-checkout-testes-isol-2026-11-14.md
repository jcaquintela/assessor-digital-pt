# Plano de correção pré-piloto: pagamentos, checkout, testes isolados e rollout de 3 pessoas

Estado: só plano. Nada é executado em produção, faturação, contas, planos, interruptores ou publicação até aprovação. Piloto NO-GO. As decisões comerciais (preços, Team/Hub) continuam do proprietário.

## Factos verificados agora (só leitura)
- O Stripe só tem o ambiente de **teste** ligado (passagem a produção por concluir). A chave de teste existe só na versão de desenvolvimento/pré-visualização; a versão publicada não tem chave e mostra "pagamentos não configurados".
- Mesmo assim, o servidor aceita `environment: "sandbox"` vindo do navegador: qualquer conta autenticada pode chamar o checkout diretamente, pagar com cartão de teste e o webhook de teste **altera o plano real** (`subscription_tier`) na base partilhada. É este o risco ALTO.
- O webhook nunca grava `billing_environment`: os 91 perfis estão todos em `sandbox` por omissão (90 manuais, 1 Stripe — o do Júlio, cancelado).
- Só 4 eventos de pagamento registados, todos de teste.
- Os eventos não guardam a data de criação do Stripe, por isso não há como recusar um evento mais antigo que o último aplicado.
- A página de subscrição mostra os 6 preços, incluindo Team/Hub, enquanto a configuração de planos diz Hub "sob consulta".
- Os 6 testes saltados exigem `TEST_SUPABASE_*` + opt-in; não existe backend de testes.

## 1. Pagamentos de teste nunca mexem em planos reais (ALTO)
Regra única: **só eventos `live` alteram direitos**. Eventos `sandbox` ficam registados e só atuam em contas marcadas como de teste.
- `billing-sync.ts`: `decideSync` recebe o ambiente; em `sandbox`, se a conta não for de teste, devolve `skip` ("evento de teste ignorado para conta real") e nunca devolve `subscription_tier`.
- "Conta de teste" = lista explícita no servidor (`billing_test_accounts`, tabela nova só para Super Admin) — nunca pelo papel nem pelo beta.
- O webhook passa a gravar `billing_environment` em cada atualização aplicada; uma conta `live` nunca é atualizada por um evento `sandbox` e vice-versa.
- `createSubscriptionCheckout` e o portal: o servidor decide o ambiente permitido (não o navegador). Na versão publicada só `live`; `sandbox` só para contas de teste.
- Testes: evento de teste em conta real não muda nada; em conta de teste muda; evento live muda; evento de teste não toca numa conta live; checkout sandbox recusado para conta real.
- Dados existentes: **não se corrige nada** nesta fase. O único perfil Stripe (Júlio) fica como está; a reclassificação, se for preciso, é uma decisão à parte.

## 2. Ordem e idempotência dos eventos (MÉDIO)
- Coluna nova aditiva `stripe_event_created` (data do evento no Stripe) em `stripe_webhook_events`, e `billing_last_event_at` no perfil.
- Antes de aplicar um evento de subscrição: se `event.created` for anterior ao último evento aplicado para essa subscrição/perfil, regista `skipped: out_of_order` e não escreve.
- Para estados críticos (`customer.subscription.updated/deleted`), em caso de dúvida lê o estado atual da subscrição ao Stripe e aplica esse em vez do conteúdo do evento.
- Mantém-se a reserva/reprocessamento já feita (falhado → volta a tentar; em curso → 409).
- Testes: `updated` antigo depois de `deleted` não reativa; `created`/`updated` em ordem inversa acaba no estado mais recente; reenvio idêntico continua a ser ignorado.

## 3. Checkout indisponível até seguro; Team/Hub só sob consulta
- Interruptor novo `billing.checkout_enabled.v1` (desligado). Desligado: a página de subscrição mostra o plano atual e "Gerir cartão e faturas" para quem já tem subscrição, mas sem botões "Subscrever"; o servidor recusa checkout novo. Subscrições existentes, portal e webhook continuam a funcionar.
- Lista de preços à venda passa a vir da configuração de planos: só planos `published` + `paid` têm checkout. Hub (`on_request`) mostra "Pedir proposta", sem checkout — no ecrã e no servidor.
- Testes: interruptor desligado recusa checkout; portal continua; Hub recusado no servidor mesmo com pedido forjado.
- Ligar o checkout fica como GO separado, depois da passagem a produção do Stripe.

## 4. Backend de testes isolado para os 6 testes saltados
- Opção recomendada: um **projeto Lovable separado só de testes** (com a sua própria base e armazenamento), com o mesmo esquema e 2 contas fictícias (A e B). Nenhuma credencial real; nunca o URL desta app (o guarda já recusa).
- O proprietário cria esse projeto e adiciona aqui, nas definições do projeto, os segredos `TEST_SUPABASE_URL`, `TEST_SUPABASE_PUBLISHABLE_KEY`, `TEST_SUPABASE_SERVICE_ROLE_KEY` e as contas `TEST_USER_A_*`/`TEST_USER_B_*`, mais o opt-in.
- Só então corro `bun run test:isolation` e o teste promocional, apenas lá; relatório com resultados reais.
- Alternativa se não houver projeto separado: os testes ficam saltados e o isolamento de ficheiros continua "não provado" na checklist.

## 5. Compatibilidade V1 e rollout fechado de 3
Antes de publicar (quando houver GO):
- Comparar o commit publicado com o testado (histórico Publish) e listar as alterações de base já aplicadas e inertes (reservas de mensagens, revogação de execução de rotina, piloto).
- Correr a suite com todos os interruptores desligados = comportamento V1; smoke test na pré-visualização com uma conta interna: mensagem simples, lembrete, briefing.
- Rollout: ligar por conta só para Júlio, Iolanda, Pedro Cunha (`pilot.v2_entitlement.v1` + flags da V2.0 por conta), um canal de cada vez, 1 mensagem controlada lida no registo de entregas.
- Rollback: desligar os interruptores por conta (sem migração de dados); voltar à versão anterior no histórico Publish se o código falhar; nada é apagado.

## Riscos restantes depois do plano
- Estado de faturação real só fica provado após passagem a produção do Stripe e um pagamento live controlado.
- Reconciliação de eventos antigos depende de o Stripe responder; se falhar, o evento fica `failed` e volta a ser tentado.
- Sem backend de testes, o isolamento de ficheiros continua por provar.

## O que requer aprovação
1. Executar os pontos 1–3 em desenvolvimento (código + 3 alterações aditivas na base partilhada, inertes até publicar).
2. Criar a lista de contas de teste de faturação (quais contas).
3. Criar o projeto de testes e adicionar os segredos (ação do proprietário).
4. Decisão comercial: Hub só sob consulta (confirmar) e quando ligar o checkout.
5. GO separado para publicar e para o rollout de 3.

## Detalhes técnicos
- Ficheiros: `src/lib/subscription/billing-sync.ts`, `webhook-process.server.ts`, `billing.functions.ts`, `checkout-policy.ts`, `src/routes/_authenticated/subscricao.tsx`, `src/lib/stripe.server.ts` (sem mudar o cliente do gateway).
- Base (aditivo): `stripe_webhook_events.stripe_event_created timestamptz`, `profiles.billing_last_event_at timestamptz`, tabela `billing_test_accounts(user_id, added_by, note)` com RLS só Super Admin.
- Ambiente permitido no servidor: `live` sempre que exista `STRIPE_LIVE_API_KEY`; `sandbox` só para contas em `billing_test_accounts`.
- Testes novos em `src/lib/subscription/*.test.ts`, incluídos em `bun run test:pilot`.
