# Redesenho do Assessor pessoal do consultor imobiliário

> Documento de decisão. Nenhum código será tocado antes de aprovação. Todos os
> dados válidos, autenticação, associação WhatsApp, segurança, ficheiros e
> registos de negócio ficam preservados. Alteramos software, não histórico.

---

## 1. Diagnóstico honesto

**O que existe hoje (real, com nomes de ficheiros):**
- `engine.server.ts` (~1.950 linhas): concentra routing, extração, decisão,
  execução, resposta e fluxo de ficheiros. Cresceu por camadas sucessivas de
  regex ("agenda", "misc", "correcção", "slot-fill", "property enrichment",
  "smalltalk"). Cada bug fez nascer outro ramo — o resultado é frágil.
- `ai.server.ts`: chama OpenAI directamente com `OPENAI_API_KEY`. Deveria
  passar pelo Lovable AI Gateway (já usado em `transcribe.server.ts`).
- `router.server.ts` (adicionado hoje): passo bom, mas ainda é interpretação
  passiva — a IA classifica, o motor decide. Sem tool-calling.
- `memory.server.ts`: bem desenhado (`pending_actions`, `conversation_states`,
  idempotência via `source_pending_action_id`). É a peça mais saudável.
- `culture/*`: sanitização, respostas curtas, máquina de estados — bons
  utilitários puros, cobertos por 100 testes. Mantêm-se.
- `agenda.ts`, `date-resolver.ts`, `follow-ups-source.ts`,
  `properties.server.ts` (extractores): utilitários deterministas úteis.
- `assessor_messages`, `pending_actions`, `conversation_states`,
  `assessor_ai_logs`, `uploaded_files`, `whatsapp_send_logs`, `follow_ups`,
  `people`, `properties`, `interactions`, `miscellaneous_items`, `routines`,
  `financial_movements`, `opportunities`, `profiles`, `user_roles`,
  `whatsapp_link_codes`: schema sólido, com RLS e GRANTs. Fica.
- Canais: WhatsApp real (`/api/public/whatsapp-webhook`), web (chat). Bem
  isolados na fronteira, mas depois desaguam todos no mesmo `processAssessorMessage`
  que faz de tudo.

**Problemas estruturais (não são "bugs isolados"):**
1. **Semântica em regex.** Decidir se "e amanhã?" é agenda, correcção ou uma
   nova visita é uma decisão semântica que hoje é tomada por dezenas de
   `RE.test(t)`. Cada nova frase natural exige um novo regex.
2. **Sem separação executor / interpretador.** A IA não tem ferramentas; o
   motor infere ferramentas a partir do intent. Resultado: divergência entre o
   que a IA "quis" e o que o motor executou.
3. **Um só ficheiro faz tudo.** `engine.server.ts` mistura orquestração,
   pesquisa, escrita, formatação de resposta e telemetria. Testar uma
   transição isolada exige mockar Supabase inteiro.
4. **OpenAI directo em vez do Gateway.** Segundo custo/segredo a gerir sem
   necessidade, e sem tirar partido do `X-Lovable-AIG-Run-ID`.
5. **Confirmação por defeito.** O sistema pergunta demasiado. Notas,
   interacções e ficheiros deviam ser guardados silenciosamente.
6. **Sem calendário externo.** O modelo já suporta timezone e fontes, mas não
   há Calendar Service — o consultor tem de reintroduzir tudo no Google/Outlook.
7. **Multi-canal só no papel.** WhatsApp e web partilham o motor, mas a
   memória conversacional é indexada por `channel`, o que quebra continuidade
   se o consultor mudar de canal.

**Bom que temos:** memória estruturada, idempotência dura de seguimentos, RLS,
associação WhatsApp com HMAC, testes de cultura, PWA iOS estável.

---

## 2. Arquitectura proposta (5 camadas)

```text
┌─────────────────────────────────────────────────────────────┐
│ Channel Layer                                              │
│  WhatsAppAdapter · WebAdapter · TelegramAdapter (futuro)   │
│  Normaliza para InboundMessage (texto, ficheiros, autor)   │
└──────────────────────────┬──────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ Conversation Orchestrator                                  │
│  Carrega estado · classifica turno · roteia · compõe reply │
│  Nunca escreve dados de negócio directamente               │
└─────────┬───────────────────────────────────┬───────────────┘
          ▼                                   ▼
┌─────────────────────────┐    ┌──────────────────────────────┐
│ Intelligence Layer      │    │ Memory Layer                 │
│  interpret(): compreende│    │  ConversationState           │
│  IA com tool-calling    │    │  PendingActions              │
│  compose(): frases PT-PT│    │  ActiveEntities              │
│  Structured outputs     │    │  Preferences · Recall        │
└─────────┬───────────────┘    └──────────────────────────────┘
          ▼
┌─────────────────────────────────────────────────────────────┐
│ Domain Services (deterministas, com auditoria)             │
│  People · Properties · Events · FollowUps · Interactions   │
│  Files · Misc · Financial · Calendars · Routines           │
│  Cada função: valida · deduplica · escreve · devolve DTO   │
└─────────────────────────────────────────────────────────────┘
```

### 2.1 Channel Layer
- `src/lib/channels/{whatsapp,web,telegram}/adapter.ts`
- Interface única: `InboundMessage { userId, conversationKey, text, media[], receivedAt, sourceIds }` e `OutboundMessage { text, richBlocks?, replyTo? }`.
- Nunca contém regras de negócio.
- Deduplicação por `source_message_id` centralizada aqui.

### 2.2 Conversation Orchestrator
- `src/lib/assessor/orchestrator.ts` (substitui `engine.server.ts`).
- Fluxo canónico (cada turno):
  ```text
  load state → classify(short-answer? confirmation? cancellation?)
             → if deterministic → execute → compose → save → send
             → else → intelligence.interpret(state, message)
                    → if IA pediu tools → domain.dispatch(tools)
                    → intelligence.compose(state, results)
                    → save → send
  ```
- Nunca chama Supabase para dados de negócio directamente — só via Domain
  Services.

### 2.3 Intelligence Layer
- `src/lib/assessor/intelligence/interpret.ts`, `compose.ts`, `tools.ts`.
- Provider único: **Lovable AI Gateway** (`google/gemini-3.6-flash` como
  default por relação custo/latência; troca via env).
- Structured output para classificação (`interpret`) e para composição de
  resposta natural (`compose`) — nunca templates concatenados.
- **Tool-calling real:** a IA pede ferramentas (ver §6), o Orchestrator
  executa, devolve resultados à IA, a IA compõe a resposta final.
- Nunca recebe base de dados completa — só o que os `tools` devolveram no
  turno actual e o `factualSummary` do estado.

### 2.4 Domain Services
- `src/lib/domain/{people,properties,events,follow-ups,interactions,files,misc,financial,calendars,routines}/service.ts`.
- Cada serviço expõe funções puras server-side: `find`, `create`, `update`,
  `link`, `search`. Validam com Zod, deduplicam, escrevem, auditam.
- São a única fronteira que escreve nas tabelas de negócio. Substituem
  centenas de linhas espalhadas hoje pelo motor.

### 2.5 Memory Layer
- Reutiliza `memory.server.ts` (já sólido), com refinamentos:
  - `conversation_states.conversation_key`: normalizada por *utilizador*, não
    por canal (permite continuidade cross-channel).
  - Novo campo `goal` (objectivo do turno) e `confirmed_fields` como jsonb
    dentro de `pending_actions.structured_payload` (compatível com colunas
    existentes, não precisa de migração destrutiva).
  - `factual_summary`: resumo rolante de 1–3 frases actualizado após cada
    execução bem-sucedida — enviado à IA em vez de histórico bruto.

---

## 3. Mapa manter · refatorar · substituir · remover

| Área | Ficheiro / peça | Decisão | Justificação |
|---|---|---|---|
| Auth | `src/integrations/supabase/*`, `_authenticated/`, Google OAuth | **Manter** | Funciona, é seguro. |
| WhatsApp inbound | `/api/public/whatsapp-webhook`, HMAC, dedup | **Manter** | Já bem isolado. |
| WhatsApp outbound | `src/lib/whatsapp/send.server.ts`, `whatsapp_send_logs` | **Manter** | Telemetria útil. |
| Ligação WA↔conta | `whatsapp_link_codes` + Settings UI | **Manter** | Fluxo LIGAR-XXXXXX preservado. |
| Ficheiros | Bucket `assessor-files`, `uploaded_files`, `files.server.ts` (download + transcrição) | **Manter, refatorar interface** | Mover para `domain/files/service.ts`. |
| Schema BD | Todas as tabelas listadas | **Manter** | Sem drop, sem rename. |
| RLS + GRANTs | Todos os `policies` e `GRANT`s existentes | **Manter** | Não tocar. |
| Cultura conversacional | `culture/sanitize.ts`, `culture/short-answers.ts`, `culture/state-machine.ts` | **Manter** | 100 testes verdes; boa base. |
| Utilitários deterministas | `agenda.ts`, `date-resolver.ts`, `follow-ups-source.ts`, `assessor-name.ts` | **Manter** | Puros, testáveis. |
| Extractores de imóvel | `properties.server.ts` (findMatching, extractPropertyFields, guessDocumentType) | **Refatorar → domain** | Passar para `domain/properties/service.ts` e `domain/files/service.ts`. |
| Memória | `memory.server.ts` | **Refatorar (aditivo)** | Adicionar `goal`, `factual_summary`. Sem breaking changes. |
| Router semântico | `router.server.ts` (novo) | **Refatorar** | Absorvido pelo novo `intelligence/interpret.ts` com tool-calling. |
| IA | `ai.server.ts` (OpenAI directo) | **Substituir** | Mover para Lovable AI Gateway. Remove dependência de `OPENAI_API_KEY`. |
| Motor | `engine.server.ts` (~1.950 linhas) | **Substituir** | Explodir em `orchestrator.ts` + Domain Services. Motor passa a <300 linhas. |
| Regex de intent | `QUERY_MISC_RE`, `QUERY_AGENDA_RE`, `MORE_RE`, `NEW_PROPERTY_RE`, etc. | **Remover** | Substituídos por interpretação IA + tool-calling. Mantêm-se apenas as regex de validação/parsing (datas, confirmações, sanitização). |
| Enriquecimento passivo de imóvel | `handleActivePropertyEnrichment` | **Substituir** | Torna-se uma tool `update_property` que a IA decide invocar. |
| Correcções ad-hoc | Bloco `looksLikeCorrection` no motor | **Substituir** | Novo `intent: correction` do interpret + tool `update_*`. |
| Telemetria IA | `assessor_ai_logs` (com `domain`, `route`, `fallback_used`) | **Manter** | Já preparada para a nova camada. |
| Dashboard | Rotas em `src/routes/_authenticated/{hoje,pessoas,imoveis,agenda,seguimentos,ficheiros,interacoes,negocio,diversos,rotinas,definicoes,admin}` | **Manter, polir** | Estrutura correcta. Apenas melhorar fichas cross-link. |
| PWA iOS | Manifest, SW, ícones | **Manter** | Estável. |
| Admin | `/admin`, `user_roles`, `admin_audit_logs`, `feature_flags` | **Manter** | Superadmin funcional. |
| OpenAI SDK / `OPENAI_API_KEY` | Dependência e segredo | **Remover** no final da Fase 1 | Substituído pelo Gateway. |

---

## 4. Plano de migração (sem perda de dados)

**Princípio:** nenhuma migração destrutiva. Só `ADD COLUMN` e criação de novas
tabelas. Novos writes escrevem em campos existentes + campos novos em
paralelo. Rollback = ignorar a nova camada e voltar a apontar o webhook ao
motor antigo (mantido em `engine.legacy.server.ts` durante a transição).

**Migrations (aditivas):**
1. `conversation_states`: `ADD COLUMN goal text`,
   `ADD COLUMN factual_summary text`,
   `ADD COLUMN active_person_id uuid REFERENCES people(id)`.
2. `pending_actions`: `ADD COLUMN confirmed_fields jsonb DEFAULT '{}'`,
   `ADD COLUMN goal text`.
3. `assessor_ai_logs`: `ADD COLUMN tool_name text`,
   `ADD COLUMN tool_success boolean`.
4. Nova tabela `assessor_tool_calls` (auditoria de tool-calling), com RLS e
   GRANTs no mesmo migration.
5. Nova tabela `calendar_connections` (para Fase 3) — criada mas vazia.

**Limpeza de dados inválidos (idempotente, opcional):**
- `pending_actions` com `status='collecting_information'` e `updated_at <
  now() - interval '24h'` → marcar `expired` (já existe `cleanupAssessorState`).
- `follow_ups` com `due_date` NULL → nunca deve existir (constraint). Se
  existir, marcar `status='cancelled'` e registar em `admin_audit_logs`.
- Nenhum `DELETE` de dados do consultor.

**Compatibilidade temporária:**
- Feature flag `assessor.engine.v2` em `feature_flags`. Enquanto OFF, tudo
  continua a passar pelo `engine.legacy.server.ts`. Quando ON por utilizador
  (via `feature_flag_users`), o Orchestrator novo assume esse consultor.
- Piloto real de 14 dias arranca com o consultor pioneiro no v2; restantes
  ficam no v1 até validação.

---

## 5. Roadmap por fases

### Fase 1 — Cérebro novo (semanas 1–2)
- Lovable AI Gateway a substituir OpenAI.
- `intelligence/interpret.ts` (structured output) + `intelligence/tools.ts`
  (definição das ferramentas OpenAI-style).
- `orchestrator.ts` mínimo: canal → estado → interpret → tools →
  compose → send.
- Domain Services: `people`, `properties`, `events`, `follow-ups`,
  `interactions`.
- Feature flag ligada só para o consultor-piloto e para o super_admin.
- Motor antigo permanece para os restantes.

### Fase 2 — Memória de negócio (semana 3)
- Ficheiros: passar tudo pelo Domain Service `files`; classificação assistida
  por IA a partir do texto extraído.
- Diversos: tool `save_miscellaneous` + `search_misc`.
- Dashboard: fichas cruzadas (imóvel ↔ ficheiros ↔ eventos ↔ pessoa) —
  polimento das rotas existentes, sem novas tabelas.
- Confirmação proporcional (§12) implementada como regra do compose.

### Fase 3 — Vida real (semana 4)
- Calendar Service (Google Calendar OAuth via connector).
- Rotinas materializadas (já existe scaffolding em `routines`).
- Financeiro consultável ("o que tenho por receber?") como tool
  `query_financial_summary`.

### Fase 4 — Escala e novos canais (semana 5)
- Telegram adapter (mesma interface do WhatsApp).
- Migração completa: consultores restantes movidos para v2.
- Remoção física de `engine.legacy.server.ts`, `ai.server.ts`, `OPENAI_API_KEY`.
- Métricas de qualidade (taxa de confirmação, taxa de correcção, latência
  média) num dashboard interno em `/admin`.

---

## 6. Testes

- **Unitários:** cada Domain Service (find/create/update/link) com Supabase
  em memória via `pg-mem` ou test project separado; todos os utilitários de
  cultura mantêm cobertura actual (100 testes).
- **Contract tests da IA:** conjunto fixo de 40 mensagens PT-PT reais →
  snapshot da decisão do interpret (intent, tools chamadas, campos
  extraídos). Falha se a IA regride.
- **Integração:** orchestrator ponta-a-ponta com Supabase de teste, ficheiro
  falso, WhatsApp mocked. 15 cenários canónicos (visita, correcção,
  documento, "e amanhã?", "quem é o Paulo?", "guarda esta ideia", …).
- **E2E:** Playwright no webhook público — envia payload real assinado,
  verifica `assessor_messages`, `follow_ups`, resposta enviada.
- **Segurança:** RLS suite (utilizador A não vê dados de B) já existente,
  reforçada para as novas colunas.
- **Isolamento multiutilizador:** teste que executa 3 conversas
  simultâneas de 3 consultores e verifica que memória, pending e resposta
  não se cruzam.

---

## 7. Riscos e mitigações

| Risco | Impacto | Mitigação |
|---|---|---|
| Regressão conversacional no piloto | Alto | Feature flag por utilizador; v1 continua até OK. |
| Custo da IA aumenta | Médio | Gateway com `google/gemini-3.6-flash` (barato); telemetria por turno em `assessor_ai_logs`; alertas ≥ €X/dia. |
| Tool-calling alucinar argumentos | Alto | Structured output com Zod; Domain Services rejeitam payloads inválidos e a IA re-tenta com o erro. |
| Latência ≥ 3s por turno | Médio | Cache do estado; tools em paralelo quando ortogonais; `service_tier` não é usado em Gemini (não aplicável). |
| Perda de continuidade no cross-channel | Baixo | `conversation_key` por utilizador, não por canal. |
| Migração de dados corrompidos | Baixo | Só `ADD COLUMN`; limpeza opcional e auditada; rollback = flag OFF. |
| Ficheiros grandes (áudio) exceder timeout | Médio | Transcrição fora do turno (job assíncrono) — mensagem "estou a ouvir" e resposta quando pronto. |
| OpenAI legacy ainda referenciado | Baixo | Remoção só em Fase 4, depois de 100% no v2. |

---

## 8. Estimativa por fase (1 engenheiro full-time)

| Fase | Duração | Deliverables | Confiança |
|---|---|---|---|
| 1 — Cérebro novo | 8–10 dias úteis | Gateway, interpret+tools, orchestrator, 5 Domain Services, piloto activo | Alta |
| 2 — Memória de negócio | 4–5 dias úteis | Ficheiros v2, Diversos v2, fichas cruzadas, confirmação proporcional | Alta |
| 3 — Vida real | 5–7 dias úteis | Google Calendar, rotinas materializadas, tool financeira | Média (depende de OAuth Google) |
| 4 — Escala | 3–4 dias úteis | Telegram, migração final, limpeza legacy, dashboard de qualidade | Alta |

**Total:** ~4 semanas de trabalho contínuo, com o piloto a receber valor a
partir do fim da Fase 1.

---

## 9. Recomendação: **Go**

Justificação:
- O risco maior é já real hoje (motor monolítico de 1.950 linhas). Cada fix
  cria o próximo bug. O redesenho não é opcional a médio prazo.
- A memória (a peça mais difícil de acertar) já está bem — reutilizamo-la.
- Zero perda de dados: só `ADD COLUMN`, feature flag, rollback trivial.
- O piloto valida a nova arquitectura numa semana; se falhar, voltamos ao v1
  sem estragos.
- Custo de IA controlado pelo Gateway e por telemetria já existente.

**Condições para arrancar:**
1. Aprovação deste plano.
2. Consultor-piloto identificado (proponho o super_admin `julio.quintela@saguii.com`).
3. Aceitação explícita de que o motor v1 fica congelado (sem novas
   features) até o v2 assumir.

Se aprovado, a primeira entrega mensurável é o fim da Fase 1: o piloto a
falar com o Assessor v2, com tool-calling real, sem regex de intenção,
custo por turno visível no Admin.
