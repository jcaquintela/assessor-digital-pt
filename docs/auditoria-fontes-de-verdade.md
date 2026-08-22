# Auditoria estrutural — factos com múltiplos caminhos de cálculo

Data: 22 Ago 2026. Âmbito: só leitura. Dados reais da conta julio.quintela@saguii.com.

## Números reais apurados (referência para a tabela)

| Medida | Valor |
|---|---|
| Pessoas totais / não arquivadas | 16 / 14 |
| Imóveis totais / não arquivados / "por angariar" | 7 / 6 / 3 |
| Negócios não arquivados (todos em fase `concluido`) | 1 |
| Seguimentos abertos com >2 dias de atraso | 36, dos quais **26 ligados a calendário externo** |
| Diversos: `status='inbox'` / `status='deleted'` / com `archived_at` | 17 / 28 / **0** |
| `pending_actions`: executed/cancelled/expired/failed/pendentes | 29 / 42 / 2 / 1 / **0** |
| Comissões: 1 movimento, estado gravado `"Prevista"` (capitalizado) | 1 |
| Ficheiros no Drive / arquivados | 23 / 0 |
| Imóveis "parados": régua 10d (Mentor) / 15d (Insight Pro) / 30-45d (Detector) | **3 / 5 / 0** |

## Tabela de auditoria

| Facto | Quem o calcula | Onde aparece | Regras de cada caminho | Divergência concreta | Legítima ou perigosa | Fonte recomendada |
|---|---|---|---|---|---|---|
| Compromissos de hoje | `supreme/overview.server.ts:99-118`; `supreme/priorities.server.ts:159-177`; fallback `hoje.tsx:292-357`; `briefing.server.ts:160-233` | cartão "Compromissos hoje", lista Prioridades, briefing, nudges | overview: só `isFollowUpOpen && isFollowUpEvent`. Prioridades: mais `belongsInDailyAgenda`, `isInternalMeeting`, `isEventOver`, "externo nunca é atraso". Fallback local: só `isPendingFollowUp` | Dos 36 atrasados, 26 são eventos externos: entram no cartão/fallback, saem das Prioridades | **Perigosa** | `computePriorities` (motor canónico já filtrado) |
| Seguimentos atrasados | banner `hoje.tsx:1001` (`isOverdueFollowUp`, >0 dias); nudge `v3/proactivity.server.ts:224-240` (>2 dias, via `computePriorities`) | dashboard vs conversa | limiares e filtros diferentes sobre o mesmo dia | 36 (>2d, sem filtros) vs poucos após filtros canónicos; banner e nudge nunca coincidem | **Perigosa** | `computePriorities`, limiar único declarado |
| Contagem de imóveis | `overview.server.ts:86,96-98` (filtra `archived_at`); `assessor/properties.functions.ts:4-31` (**sem** `archived_at`, limit 200) → `imoveis.index.tsx:112` | cartão Hoje vs cabeçalho de Imóveis | inclusão de arquivados difere | 6 (Hoje) vs 7 (lista Imóveis) hoje mesmo | **Perigosa** | query única com `archived_at is null` |
| Estado ativo/concluído de negócio | canónico `lib/deals/stages.ts:68-89` (`stage` + fallback `status`); local `negocios.index.tsx:113-116` (só `stage`) | cartão Hoje, Kanban, briefing, mentor | fallback ao `status` legado só existe no canónico | 1 negócio `stage=concluido/status=Concluída`: Hoje mostra 0 em curso, Kanban mostra card Concluído 1 (coerente hoje; registos legados sem `stage` divergiriam) | **Perigosa (latente)** | `isDealActive`/`isDealClosed` em todos os call sites |
| Contagem de negócios ativos | `overview.server.ts:95`; `priorities.server.ts:246`; `negocios.index.tsx:114` | Hoje, Negócios, briefing | ver linha acima | — | Perigosa (mesma raiz) | idem |
| "Imóvel parado" | Mentor `overview.server.ts:189-218` (10d, só `por_angariar`); Insight Pro `imoveis/insight.server.ts` (15d, todos exceto vendido/arquivado); Detector `opportunities/detector.ts:56-91` (30/45d, exclui `por_angariar`, usa `lastMovementAt`); cartão de atenção `imoveis/attention.server.ts` (10d, sem filtro `archived_at`) | Hoje (mentor + alertas), Imóveis (cartão + insight) | 4 réguas, 2 definições de "movimento" | 3 vs 5 vs 0 imóveis "parados" no mesmo instante | **Legítima nos limiares** (propósitos diferentes), **perigosa na apresentação** (não declara a régua nem a definição) e no `archived_at` em falta | manter réguas, declarar régua+definição; `computeLastContact` como base única |
| Contagem de pessoas | `overview.server.ts:87` (corrigido hoje); `people/insight.server.ts:9-45`; `people/attention.server.ts:19` (**sem** `archived_at`); `store.tsx` (filtra no cliente) | Hoje, Pessoas, insights | filtros de arquivo diferentes | 16 vs 14 (corrigido em Hoje; `attention.server.ts` continua a ver 16) | **Perigosa** | filtro `archived_at is null` na query, não no cliente |
| Último contacto real | canónico `insights/last-contact.ts` + `.server.ts`; alternativa local em `people/attention.server.ts:18-27`; `detector.ts` usa `lastMovementAt` | Mentor, insights Pro, cartões de atenção, alertas | canónico inclui contacto via negócio ligado; o local não; `.server.ts` não filtra `archived_at` nas origens | atenção da pessoa pode mostrar "sem contacto" quando o Mentor conta contacto via negócio | **Perigosa** | `computeLastContact` sempre |
| Movimento financeiro "por fechar" | `overview.server.ts:120-123` (lowercase + EN); `negocio.index.tsx:48` (lowercase, duplicado); `negocio.faturacao.tsx:66-68` (comparação exata `"Prevista"/"Recebida"`) | Hoje, /negocio, Faturação | 3 regras de estado | hoje coincidem (único registo é `"Prevista"`); qualquer registo minúsculo ou em inglês desalinha os três ecrãs | **Perigosa (latente)** | um helper de estado de movimento, como `stages.ts` |
| Arquivados em `financial_movements` | `overview.server.ts:91` filtra; `store.tsx:622` filtra no cliente; `negocio.index.tsx:72-76` e `deals.functions.ts:32` **não filtram** | Hoje, Faturação, ledger, ficha de negócio | inclusão de arquivados difere | 0 arquivados hoje → sem efeito visível; risco imediato ao primeiro arquivo | **Perigosa (latente)** | filtro no servidor em todas as leituras |
| Diversos por tratar | `overview.server.ts:88` (`status='inbox'` + `archived_at is null`); `diversos.tsx:143-147` (`status`, abas inbox/archived) | Hoje, Diversos | dois modelos de arquivo | 17 inbox, 28 `deleted`, **0 com `archived_at`** — o filtro do servidor nunca faz nada; arquivar só muda `status` | **Perigosa** (modelo de arquivo divergente do resto do produto) | um único modelo de arquivo por tabela |
| Documentos por tratar (Drive) | `drive.tsx:538-543` (cliente: `requires_review` + `processing_status`) | só página Drive | não existe contraparte agregada em Hoje/briefing | facto ausente do resumo do dia (0 por tratar hoje: 20 `processed`, 3 `organized`) | Lacuna, não divergência | — |
| Quota do Drive vs ficheiros visíveis | `drive/monthly-quota.server.ts:12-22` conta arquivados; `drive.functions.ts:184-186` esconde-os | barra de quota vs grelha | inclusão de arquivados difere | 23 vs 23 hoje (0 arquivados); diverge no primeiro arquivo | **Legítima na contagem** (quota conta uploads consumidos), **perigosa na apresentação** (mesmo número, dois significados) | manter, rotular a barra como "uploads do mês" |
| Propostas por confirmar | `pending_actions` / `conversation_states` (`v3/act.server.ts:269,296`, `pending-confirmation.tsx`) | só chat/dashboard-chat | nenhum motor de prioridades/overview lê estas tabelas | 0 pendentes agora; 42 cancelados históricos nunca apareceram em Hoje nem no briefing | Lacuna estrutural | — |
| Sugestão do Mentor | `overview.server.ts:155-277`, gate tier `consultor` (`mentor-context.ts:184`) | só dashboard | não é chamado por `briefing.server.ts` nem `proactivity.server.ts` | consultor que só usa WhatsApp nunca vê a sugestão | Lacuna | — |
| Alertas de oportunidade | `opportunities/detector.ts` + `detector.server.ts` (gate `pro`), digest `digest.server.ts` | Hoje + resumo diário | mesma função nos dois; digest envia só o mais urgente | sem divergência de regra | **Legítima** | — |
| Prioridades (composição/limite) | `priorities.functions.ts:16` (limit 5) vs `briefing.server.ts:62,148` (limit 3) | dashboard vs briefing | mesmo motor, cortes diferentes | briefing omite itens 4-5 | **Legítima** (espaço de mensagem) | — |
| Fronteira de dia | `priorities.server.ts:389-421` usa instante UTC; restante motor usa dia de calendário Lisboa | "aguarda resultado" vs "atrasado" | fusos diferentes | efeito só perto da meia-noite | Perigosa (baixa frequência) | `lisbonYmd` em todo o motor |
| Gates de tier sobre o mesmo sinal | Mentor: `consultor`; Detector: `pro`; imóveis `por_angariar` excluídos do Detector (`detector.server.ts:16,64`) | Hoje | dois gates para "parado/frio" | consultor Pro sem nível `consultor` fica sem qualquer aviso sobre imóveis por angariar | **Perigosa** (buraco de cobertura) | decisão de produto |
| Notas: `hasCommercialOutcomeContext` importado e nunca usado em `priorities.server.ts:5` | — | — | regra pretendida não aplicada nesse ficheiro | — | Suspeita | verificar intenção |

## Ordenação por impacto no consultor

1. Compromissos/atrasados com filtros diferentes entre cartão, prioridades, banner e nudge (26 de 36 atrasados são ruído de calendário externo).
2. `archived_at` aplicado de forma inconsistente (imóveis 6 vs 7; pessoas em `attention`; movimentos em `/negocio`).
3. "Imóvel parado" com 3 números simultâneos (3/5/0) sem régua declarada em todo o lado.
4. Estado de negócio recalculado à mão em `negocios.index.tsx` sem o fallback legado.
5. Três regras de estado de movimento financeiro (maiúsculas vs minúsculas vs inglês).
6. Modelo de arquivo divergente em `miscellaneous_items` (`status` vs `archived_at`).
7. Quota do Drive com semântica diferente da grelha.
8. Lacunas: propostas por confirmar e Mentor ausentes do briefing; "por tratar" do Drive ausente do resumo.
9. Fronteira UTC vs Lisboa em `findAwaitingOutcome`.
