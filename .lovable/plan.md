# Registo natural de contactos — Plano

Feature grande com muitas ramificações. Proponho entregar em 3 fases dentro deste turno, focando o núcleo (17. Critérios de aceitação) e deixando integrações externas para depois (importação CSV/Google/Microsoft — ponto 14 fica fora).

## Fase 1 — Modelo de dados e deduplicação

**Migração `people` + `person_phones`:**
- Novo enum `person_role`: `owner`, `potential_owner`, `buyer`, `potential_buyer`, `client`, `reference`, `partner`, `supplier`, `colleague`, `other`.
- `people.roles person_role[]` (mantém `relationship_type` como papel primário para compatibilidade; deriva do primeiro elemento).
- Colunas novas em `people`: `company text`, `job_title text`, `source_channel text`, `source_message_id uuid`, `source_file_id uuid`, `search_location text`, `search_property_type text`, `budget_min numeric`, `budget_max numeric`, `referred_by_person_id uuid`, `preferences jsonb`.
- Nova tabela `person_phones` (id, person_id, raw, e164, country_code, kind: mobile|landline|whatsapp|unknown, is_primary, created_at).
- RLS por `user_id` do dono; grants para authenticated + service_role.
- Índices em `e164` e `email` (normalizado).

**`src/lib/people/normalize.ts`** (novo):
- `normalizePhoneE164(raw, defaultCountry='PT')` → { e164, country_code, kind } (heurística: começa por `9`/`2` → PT +351; `+xx` respeitado).
- `normalizeEmail(raw)` → lowercase trimmed.
- `similarName(a,b)` → normalize (lower + sem acentos + tokens ordenados) e retorna score 0-1.

**`src/lib/people/dedupe.functions.ts`** (server fn autenticada):
- Input: `{ name?, phone?, email?, company? }`.
- Prioridade: e164 exato > email exato > (nome≥0.8 + contexto) > nome≥0.9.
- Retorna `{ match: person | null, confidence, reason }`.

## Fase 2 — Motor conversacional

**Extração no motor v3 (`src/lib/assessor/v3/`)** — reforço, não substituição:
- `extractors/person.ts` novo: dado texto (ou já transcrito), extrai `name, phones[], emails[], roles[], company, location, property_type, budget, referredBy, nextAction` via IA (Gemini) com JSON prompt (sem enums grandes em schema). Não inventa: campos ausentes = null.
- No `decide.server.ts` (ou equivalente), quando intent = criar/atualizar pessoa:
  1. chamar dedupe;
  2. se match forte (telefone/email idêntico) → propor "Já tens X. Atualizo o contacto?" com merge não-destrutivo (só preenche campos vazios; adiciona papéis; adiciona telefones novos);
  3. se sem match e há nome + contacto/contexto → propor criação;
  4. se só nome vago → registar como rascunho e perguntar naturalmente.
- `pending_actions` já suporta o ciclo colecting/pending_confirmation/executed — reutilizar.
- Se preferência `autonomy_level = 'proativo'` **e** confiança alta **e** telefone válido → auto-criar sem confirmação (respeita ponto 3).
- Atualizações de notas de baixo risco vão direto (append em `notes`, sem confirmação).
- Enriquecimento progressivo: quando `conversation_states.active_person_id` está setado, novas mensagens actualizam essa ficha em vez de criar nova.

**Ficheiros (cartão visita / vCard):**
- `src/lib/people/vcard.ts`: parser mínimo (FN, TEL, EMAIL, ORG, TITLE).
- Em `files.server.ts` classification: novo tipo `business_card` e `vcard`. Para `business_card` chama Gemini vision (JSON schema pequeno: name/phone/email/company/title). Para `.vcf` usa parser. Cria `pending_action` a propor pessoa com `source_file_id` e responde "Encontrei X, Y. Crio o contacto?".

**Áudio:** já é transcrito; o texto entra pelo mesmo pipeline. Se transcrição incluir "lembra-me de …" o motor cria pessoa **e** follow-up ligado (`follow_ups.person_id`).

## Fase 3 — UI

**Ficha `/pessoas/$id`** (refactor):
- Cabeçalho: nome, badges de papéis, telefone principal (clicável `tel:`), botão WhatsApp (`https://wa.me/<e164>`), botão "Adicionar nota", próxima ação.
- Secção Contexto: resumo, origem, necessidades (localização/tipo/orçamento), preferências (jsonb livre), notas — editáveis inline.
- Secção Relações: imóveis (owner + interesse), oportunidades, visitas (via follow_ups tipo visita), seguimentos, interações, ficheiros de origem.
- Secção Histórico: timeline a partir de `interactions` + created_at + updated_at + follow-ups + messages associadas (via `assessor_messages.related_resource_id`).

**Quick add em `/hoje`:**
- `QuickAdd` já existe com "Pessoa"; substituir modal por 2 tabs:
  - **Natural**: textarea "Quem queres registar?" → envia para `/assessor` com prefill (comportamento atual mantido).
  - **Manual**: nome, telefones (múltiplos), email, papéis (multi-select), empresa, notas → server fn `createPersonManual`.

**Não fazer nesta fase:**
- Importação CSV/Google/Microsoft (ponto 14) — deixar TODO no código com `docs/pessoas-importacao.md` stub.
- Interações timeline avançada (versionamento de alterações) — só append.

## Detalhes técnicos

- Sem `.min/.max/format` nos schemas de IA (regra `ai-sdk-agent-patterns`).
- Modelo IA: `openai/gpt-5.6-sol` com `reasoningEffort: "none"` para extração (JSON via prompt + parse).
- Vision cartão visita: `google/gemini-3.1-flash` (rápido, barato) via `/v1/chat/completions` com `image_url`.
- Merge não-destrutivo: só preenche campos NULL; concatena `notes` com timestamp; `person_phones` faz UPSERT por `e164`.
- Todas as queries por `user_id = auth.uid()` (RLS já ativa).
- Preservar contract com store legacy: `relationship_type` continua populado (primeiro role).
- Teste rápido: 5 casos naturais nos testes existentes (`culture.test.ts` padrão).

## Fora de scope

Ponto 14 (importação em massa) e histórico com diff auditável — ficam para iteração seguinte com nota no código.

Confirmas para arrancar? Se quiseres reduzir para uma fase única mais pequena (por exemplo, só extração de texto + dedupe + ficha), diz-me.
