# Auditoria read-only — código atual vs matriz ACI V1

Âmbito: leitura do código, dos testes e da configuração dos motores na base de dados (só consulta). Nada foi alterado e nenhum teste foi corrido nesta auditoria.

Legenda:
- **FUNCIONAL:** há código executável e testes unitários/golden. Não prova que funcione em produção.
- **PARCIAL**, **NÃO EXISTE**, **NÃO VERIFICÁVEL:** como o nome indica.

## 1. Modelo e motor efetivos

- **Motor ativo:** a configuração `assessor.engine.v3` está ligada para todos (`enabled_globally = true`, desde 31/07). Ou seja, o motor v3 corre para **todos os utilizadores** e não só para o Julio, como diz a memória do projeto (inconsistência a corrigir na documentação).
- **Ordem de fallback:** `engine.server.ts:414-438` tenta v3, depois v2 e por fim o legado. Basta um erro capturado no v3 para cair no v2 ou no legado.
- **Modelos:**
  - v3 (THINK e DECIDE) e v2 usam `google/gemini-3.6-flash` (`v2/gateway.server.ts`).
  - O caminho legado (`ai.server.ts`) usa `gpt-5-nano`.
- **Router determinístico:** curto-circuita o LLM em vários casos, incluindo a proteção de instruções internas.
- **Dashboard chat:** passa pelo mesmo pipeline e não tem um modelo próprio.
- **NÃO VERIFICÁVEL:** que percentagem de turnos cai em fallback. Não existe uma métrica por turno.

## 2. Competências ACI

| # | Competência | Estado | Evidência | Lacuna | Risco | Esforço |
|---|---|---|---|---|---|---|
| 1 | Qualificação contextual | PARCIAL | Zona, tipologia e orçamento guardados (`people.functions.ts`) e usados por `detector.ts` (`matchScore`) | Não há sequência de qualificação (prazo, financiamento, motivação) nem testes dedicados | Matches pobres por falta de critérios | M |
| 2 | Pós-visita | FUNCIONAL | `audio-themes.server.ts` (`analyseAudioThemes` extrai reação e objeção; `execTheme`) e `visit-followup.server.ts` (`buildVisitFollowUp`); testes golden | Transcrição real de áudio não testada de ponta a ponta | Baixo | P |
| 3 | Objeções | FUNCIONAL (coaching) / PARCIAL (memória) | `objection-guide.ts` (10 min antes de angariação), modo sparring (`sparring.functions.ts`, `sparring-turn.ts`) | A objeção é atributo da visita e não entidade do grafo | Não há histórico de objeções por pessoa/imóvel | M |
| 4 | Prospeção | FUNCIONAL | `create_prospecting_lead` (`v2/tools.ts`, `execCreateProspectingLead`); `prospecting.test.ts` | — | Baixo | — |
| 5 | Apresentação centrada em necessidades | PARCIAL | Só a mensagem pós-visita é contextual | Não há ativo "apresentação deste imóvel a este comprador" | Competência prometida sem suporte | M |
| 6 | Negociação/fecho | PARCIAL | `createDealCore`, Kanban, `dealCoolingAlerts` (proposta/CPCV/escritura); `pipeline.test.ts` | A proposta não é entidade com ciclo próprio; não há apoio de negociação | Propostas sem resposta passam despercebidas | M-G |
| 7 | Seguimento contextual | FUNCIONAL | `outcomes.server.ts` (`applyFollowUpOutcome`, `resolveOutcomeTargetFromText`), `isFollowUpSettled`; vários testes golden | — | Baixo | — |
| 8 | Match + proatividade | FUNCIONAL (match) / PARCIAL (entrega) | `detector.ts` (`matchAlerts`: zona 40, tipologia 30, orçamento 30, limiar 80), só no ecrã Hoje | Os tipos de aviso de `generateNudgesForUser` não incluem match nem negócio parado; o match não chega ao WhatsApp/Telegram | O diferencial central não chega ao canal | M |

## 3. Requisitos transversais

| Requisito | Estado | Evidência / lacuna |
|---|---|---|
| 1 input -> 1 ativo útil | NÃO EXISTE como regra | `prompts.ts` pede "uma ação, uma pergunta"; `executeAudioThemes` e `executeAudioBreakdown` criam vários registos. Não há medição do ativo por input |
| Memória por conta partilhada entre canais | PARCIAL | Os registos são por `user_id`, mas as ações pendentes, o estado da conversa e o lock são por canal (`memory.server.ts:57-67, 291-341`; `lock.server.ts`; `engine.server.ts:443-450`) |
| Aprovação só para ações externas | FUNCIONAL | Email: `compose_email_to_contact` só propõe e o envio exige `confirmed` (`reply-draft.server.ts:443-459`). `no-direct-contact.ts` e as mensagens "Copiar" também cumprem. A frase do prompt "NUNCA contactas terceiros" contradiz o email confirmado |
| Proatividade: 1 intervenção/dia | NÃO CUMPRE | `max_daily_nudges DEFAULT 6` (migração, `definicoes.tsx`, `supreme/briefing.server.ts`). `dispatchPendingNudges` não aplica um teto diário global |
| Negócio parado | INCONSISTENTE | `isDealStalled` considera mais de 10 dias; o detector usa ≥5 dias só para proposta/CPCV/escritura; o plano diz mais de 5 dias |
| Zero-UI | NÃO CUMPRE | Ecrãs de consultor ativos: hoje, pessoas, imóveis, negócios, seguimentos, calendário, drive, comunicação, definições |
| Cold start | PARCIAL | `v3/onboarding.ts` pede nome e objetivos; não pede os "3 negócios prioritários" nem mede os 2 minutos até ao primeiro ativo |
| Trial | PARCIAL | 14 dias (`trial.server.ts`), mas começa na escolha do canal (`startTrialForChannelChoice`, `ligar-canal.tsx`) e não na primeira mensagem válida |

## 4. Inconsistências com os planos

1. **Limite de alertas:** o plano ACI diz 2/dia, a decisão atual diz 1/dia e o código usa 6/dia, sem teto no dispatch.
2. **Motor v3:** a memória diz "só Julio", mas a configuração tem-no ligado para todos.
3. **"Nunca contactas terceiros":** o prompt diz isto, mas existe envio de email após confirmação.
4. **Negócio parado:** o critério é diferente em três sítios (plano, `isDealStalled`, detector).
5. **Trial:** começa na escolha do canal e não na primeira mensagem.

## 5. Estático vs testado vs produção

- 268 ficheiros de teste unitários/golden e 10 specs Playwright (`e2e/`), centradas em ecrãs web.
- Não há testes de ponta a ponta reais por WhatsApp/Telegram, nem bateria de evals comerciais (os 100 casos estão por escrever).
- **Produção:** nos últimos 60 dias não há avisos de oportunidade comercial registados (observação anterior). O comportamento das competências 5, 6 e 8 em canal não está demonstrado.

## 6. Cinco correções prioritárias (por impacto)

1. **Levar o match e o negócio parado ao canal.** Novos tipos no caminho único `assessor_nudges`, com explicação do porquê. Esforço M.
2. **Teto global de 1 intervenção/dia** aplicado em `dispatchPendingNudges`, com o default alterado para 1, e prioridade por impacto × urgência × confiança. Esforço P-M.
3. **Estado conversacional e lock por conta**, e não por canal: ações pendentes partilhadas entre WhatsApp e Telegram. Esforço M.
4. **Cold start com os 3 negócios prioritários** e medição do tempo até ao primeiro ativo; trial a começar na primeira mensagem válida. Esforço M.
5. **Instrumentar "1 input -> 1 ativo"**: registar por turno o ativo criado (ou o motivo para não haver) e o motor/fallback usado; unificar o critério de negócio parado. Esforço P-M.

## 7. Testes de aceitação reproduzíveis

- **A1:** negócio em proposta parado há 6 dias → 1 aviso no canal preferido, com motivo; a 4 dias → nenhum.
- **A2:** comprador (zona, T2, 300k) e imóvel novo compatível (score ≥80) → 1 aviso de match com a justificação dos critérios.
- **A3:** com 3 avisos elegíveis no mesmo dia → sai 1 (o de maior prioridade), 0 duplicados entre canais, nada ao domingo nem em horário de silêncio.
- **A4:** pergunta pendente aberta no WhatsApp e resposta "sim" no Telegram → a ação é aplicada uma única vez.
- **A5:** primeira mensagem de conta nova → pede os 3 negócios prioritários; um áudio com 3 negócios gera ≥1 ativo útil em ≤2 min; o trial regista `trial_started_at` nesse momento e não na escolha do canal.
- **A6:** input com dados suficientes → regista exatamente 1 ativo; input insuficiente → 1 pergunta e 0 dados inventados.
- **A7:** pedido "envia ao João" → fica rascunho e só sai após confirmação explícita.

Sem implementação até aprovação explícita de cada correção.
