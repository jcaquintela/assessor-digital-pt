# Drive Inteligente — Plano de Entrega

Antes de escrever código, entrego os 7 artefactos exigidos no ponto 27. Só avanço para as fases A→D após aprovação.

---

## 1. Auditoria do sistema atual de ficheiros

O que já existe:

- **Tabela `uploaded_files`** com: `channel`, `source_message_id`, `external_file_id`, `original_file_name`, `internal_file_name`, `mime_type`, `size_bytes`, `storage_path`, `processing_status`, `classification`, `document_type`, `extracted_text`, `extracted_metadata`, `classification_confidence`, `related_resource_type`, `related_resource_id`, `related_pending_action_id`, `error_code`, `error_message`, `user_description`. RLS ativa (4 policies).
- **Bucket `assessor-files`** privado.
- **Pipeline `src/lib/assessor/files.server.ts`** (324 linhas): recebe via WhatsApp, valida MIME, aplica limites por tipo, bloqueia executáveis/zips, guarda no bucket, cria linha em `uploaded_files`. Já faz transcrição de áudio (Gemini) e classificação básica com confiança.
- **Extractores em `properties.server.ts`** (morada, tipologia) que consomem o `extracted_text`.
- **Página `/documentos`** — listagem simples (sem detalhe, sem preview, sem relações múltiplas, sem filtros semânticos).

Lacunas críticas:

1. Associação **1-para-1** via `related_resource_type/id` — impossível ligar o mesmo ficheiro a imóvel + pessoa + oportunidade sem duplicar.
2. Sem **checksum** → nenhuma deteção de duplicados ou versões.
3. Sem **estados** `awaiting_confirmation`, `archived`, `deleted` (só `received/processing/organized/failed`).
4. Sem **página de detalhe** `/drive/:id`, sem **preview seguro** (URL assinada), sem **pesquisa semântica**.
5. Sem **fluxo conversacional** de confirmação para classificação de baixa/média confiança (ficheiros órfãos vão para "Diversos" implicitamente).
6. Sem **ai_summary**, sem `requires_review`, sem `archived_at/deleted_at`, sem `source_external_file_id` normalizado.
7. Upload direto pelo dashboard **não existe**.

---

## 2. Modelo de dados proposto

### 2.1 Extensão a `uploaded_files`

Adicionar:
- `checksum` (text, sha256 hex, indexed)
- `ai_summary` (text)
- `requires_review` (bool, default false)
- `archived_at`, `deleted_at` (timestamptz)
- `source_external_file_id` (text) — renomear/complementar `external_file_id`

Migrar `processing_status` para incluir: `received | scanning | processing | pending_classification | awaiting_confirmation | organized | failed | archived | deleted`.

**Retro-compat:** manter `related_resource_type/id` como cache do "link primário" (usado na UI legada), mas a fonte de verdade passa a ser `file_links`.

### 2.2 Nova tabela `file_links`

```
id uuid pk
user_id uuid (RLS)
file_id uuid → uploaded_files(id) on delete cascade
entity_type text  -- person|property|opportunity|follow_up|interaction|miscellaneous|prospecting_lead
entity_id uuid
relation_type text -- belongs_to|supports|received_from|related_to|version_of|evidence_for|attachment
source text        -- ai|user|rule|migration
confidence numeric
confirmed_at timestamptz
created_at timestamptz
unique(user_id, file_id, entity_type, entity_id, relation_type)
```

RLS: `user_id = auth.uid()`. Índices em `(user_id, entity_type, entity_id)` e `(user_id, file_id)`.

### 2.3 Tabela auxiliar (Fase C)

`file_versions(id, user_id, group_id, file_id, version_no, created_at)` — agrupa versões via `relation_type='version_of'` com um `group_id` estável.

---

## 3. Arquitetura do pipeline

Função central única — evolução de `processIncomingFile(input)` já existente, refatorada em módulos:

```
processIncomingFile(input)
  ├─ 1. ingest       → download bytes (WhatsApp/Telegram/dashboard) + metadados
  ├─ 2. validate     → MIME real (magic bytes), tamanho, blocklist
  ├─ 3. persist      → storage privado (path user/YYYY/MM/uuid.ext) + linha em uploaded_files
  ├─ 4. checksum     → sha256; se existe → ramo "duplicado/versão"
  ├─ 5. scan         → antivírus (stub Fase A; ClamAV/HTTP service Fase D)
  ├─ 6. extract      → texto/OCR/transcrição por tipo (pdf-parse, tesseract-wasm no server fn, Gemini para áudio/imagem)
  ├─ 7. classify     → LLM structured output { document_type, suggested_destination, suggested_entity_ids[], confidence, extracted_fields, reason }
  ├─ 8. link         → cria linhas em file_links; se confidence ≥ 0.85 auto, senão awaiting_confirmation + pergunta pelo canal
  ├─ 9. enrich       → propõe atualização da ficha (não escreve campos sensíveis sem confirmação)
  └─ 10. audit       → assessor_ai_logs + evento na conversa
```

Regras invioláveis:
- **IA nunca escreve na BD** — apenas devolve JSON; escrita feita por Domain Services (`links.server.ts`, `enrichment.server.ts`).
- Storage sempre privado; preview via `createSignedUrl(300s)`.
- Isolamento por `user_id` verificado em todas as queries e no download.

---

## 4. Wireframe textual do Drive

**Rota `/drive`** (desktop 2 colunas; mobile 1 coluna, "Por tratar" primeiro):

```
┌──────────────────────────────────────────────────────────┐
│ Drive                    [🔍 Pesquisar no Drive…    ] [+]│
├──────────────────────────────────────────────────────────┤
│ Recentes | Por tratar (3) | Imóveis | Pessoas | Diversos │
│                                          | Arquivados     │
├────────────┬─────────────────────────────────────────────┤
│ Filtros    │  ⚠ 3 ficheiros aguardam a tua confirmação   │
│ ─ Tipo     │  ┌─────────────────────────────────────────┐│
│ ─ Imóvel   │  │ 📄 CPU_boavista.pdf                     ││
│ ─ Pessoa   │  │ CPU · Moradia Boavista · WhatsApp · 2h  ││
│ ─ Estado   │  │ [Abrir] [Reclassificar] [Arquivar]      ││
│ ─ Canal    │  └─────────────────────────────────────────┘│
│ ─ Data     │  ┌─────────────────────────────────────────┐│
│            │  │ 🖼 IMG_2381.jpg                          ││
│            │  │ Placa · possível prospeção · hoje       ││
│            │  └─────────────────────────────────────────┘│
└────────────┴─────────────────────────────────────────────┘
```

**Rota `/drive/:id`**:

```
┌──────────────────────────────────────────────────────────┐
│ ← Drive                                                  │
│ 📄 CPU_boavista.pdf                    [⬇] [🗑] [📁]     │
│ CPU · Organizado · WhatsApp · 27 Jul 2026                │
├─────────────────────────────┬───────────────────────────┤
│                             │ Resumo                    │
│   [ pré-visualização PDF ]  │ Contrato-promessa entre… │
│                             │                           │
│                             │ Campos identificados      │
│                             │ • Vendedor: João Silva    │
│                             │ • Área: 145 m²            │
│                             │ • Preço: 285.000 €        │
│                             │                           │
│                             │ Relações                  │
│                             │ 🏠 Moradia Boavista       │
│                             │ 👤 João Silva (vendedor)  │
│                             │ 💼 Angariação #12         │
│                             │ [+ Associar]              │
│                             │                           │
│                             │ Histórico                 │
│                             │ • Recebido via WhatsApp   │
│                             │ • Classificado (0.92)     │
│                             │ • Associado ao imóvel     │
└─────────────────────────────┴───────────────────────────┘
```

Nas fichas de Imóvel/Pessoa/Oportunidade, o separador "Documentos" passa a ler de `file_links` filtrado por essa entidade.

---

## 5. Plano de migração

Script idempotente em migração SQL + backfill server-side (sem apagar nada):

1. Adicionar colunas novas em `uploaded_files` (nullable).
2. Criar tabela `file_links` + RLS + GRANTs.
3. Backfill: para cada linha com `related_resource_type/id` não nulo, inserir `file_links(file_id, entity_type=related_resource_type, entity_id=related_resource_id, relation_type='belongs_to', source='migration', confidence=1, confirmed_at=created_at)`.
4. Backfill de `checksum`: job diferido (não-bloqueante) que recalcula sha256 lendo do storage; ficheiros grandes/ausentes → marcar `requires_review=true`.
5. Reclassificar ficheiros em `related_resource_type='miscellaneous'` como candidatos a "Por tratar" apenas se `classification_confidence < 0.7`.
6. Nenhum ficheiro é apagado. Rollback: `DROP TABLE file_links` + remover colunas novas (as originais permanecem intactas).

---

## 6. Riscos

| Risco | Mitigação |
|---|---|
| Custo LLM/OCR dispara com muitos PDFs | Cap por utilizador/dia; OCR só quando `extract_text` do PDF vier vazio; registar tokens em `assessor_ai_logs` |
| Malware scan real requer serviço externo | Fase A: bloqueio por MIME + magic bytes; Fase D: integração com serviço HTTP (ClamAV/VirusTotal) |
| Backfill de checksum lento em contas grandes | Job assíncrono paginado; UI mostra "a processar" |
| IA inventa relações | `confidence < 0.85` → sempre `awaiting_confirmation`; nunca escrever campos sensíveis (morada, preço, proprietário) sem confirmação explícita |
| Preview de DOCX/XLSX no browser | Fase A: só download + amostra de texto; preview nativo apenas PDF/imagem |
| RLS bypass via URL assinada | URLs geradas server-side após verificar `user_id`; TTL 5 min |
| Duplicação de UX vs `/documentos` | `/documentos` é removida em favor de `/drive` na Fase A |

---

## 7. Estimativa por fase

- **Fase A — Fundação** (storage privado reforçado, `file_links`, `/drive` básico, `/drive/:id` com preview PDF/imagem, upload pelo dashboard, migração backfill): **~1 dia** de implementação.
- **Fase B — Classificação e organização** (LLM structured output com `awaiting_confirmation`, fluxo de confirmação no chat, tab "Por tratar", integração nas fichas Imóvel/Pessoa): **~1 dia**.
- **Fase C — Extração e pesquisa** (OCR imagens, pdf-parse, vCard estruturado, checksum + versões + duplicados, pesquisa semântica sobre `extracted_text` + `ai_summary`): **~1 dia**.
- **Fase D — Canais e piloto** (opções interativas WhatsApp/Telegram para desambiguação, métricas Super Admin, malware scan real, feature flag `drive.v1` por utilizador): **~0.5 dia**.

Total: ~3.5 dias. Cada fase termina com validação (tests + rota navegável) antes de avançar.

---

## Feature flag

Tudo protegido por `drive.v1` em `feature_flag_users`, ativada primeiro para `julio.quintela@saguii.com`. `/documentos` mantém-se acessível durante Fase A→B como fallback e só é removida ao ativar globalmente.

---

Confirmas para arrancar **Fase A**? Se preferires ajustar prioridades (ex.: começar pela pesquisa semântica, ou adiar upload no dashboard), diz o que trocar antes de eu começar a escrever código.
