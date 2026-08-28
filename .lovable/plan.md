# Aviso proativo de conflitos de horário na Agenda

## O que encontrei antes de desenhar

- Os compromissos vivem todos em `follow_ups` (`due_date` + `due_time`), sem coluna de duração. A janela de um compromisso já é calculada num sítio só: `eventWindow()` em `src/lib/assessor/supreme/event-window.ts`, com 60 minutos por omissão.
- `computePriorities` só olha para **hoje e atrasados** (corta em `endOfLisbonDayIso`) e produz itens de **um assunto só** (`subject_id` único). Um conflito é sempre um **par** e muitas vezes é **amanhã ou na próxima semana** — não cabe nesse formato sem distorcer o motor.
- Já existe um caminho proativo único e validado: `generateNudgesForUser` (`src/lib/assessor/v3/proactivity.server.ts`) → tabela `assessor_nudges` → `dispatchPendingNudges` no cron `proactive-tick`. Tem teto diário (3), `dedupe_key` único por utilizador, horário útil, e estados `sent`/`resolved`/`dismissed`.

Conclusão: o mecanismo de aviso certo é o **nudge existente**, não um segundo caminho. `computePriorities` fica como está — o nudge de conflito é gerado no mesmo ciclo que já consome as prioridades, portanto continua a haver uma só rotina proativa.

## Desenho proposto

### 1. Onde se detecta
Detecção **no ciclo proativo**, não à nascença. Razão: um conflito não é uma propriedade de um evento (como a categoria), é uma relação entre dois — e o segundo evento pode chegar por importação horas depois, ou uma alteração pode desfazer o conflito. Detectar no ciclo cobre de graça os eventos criados por conversa, os importados do Google/Outlook e os do backfill de séries, sem tocar em nenhum desses caminhos.

Janela analisada: de agora até **14 dias** à frente.

### 2. Definição de colisão
Qualquer sobreposição de intervalo: `A.início < B.fim && B.início < A.fim`, com as janelas do `eventWindow()` (60 min por omissão). Encostados não colidem (10h–11h e 11h–12h estão bem).

Excluídos: compromissos sem hora (dia inteiro), aniversários, itens de lazer/pessoais (`belongsInDailyAgenda`), fechados/arquivados/cancelados, e pares que sejam a mesma série recorrente duplicada (já tratada pelo dedupe do Outlook).

### 3. Mecanismo de aviso
Novo `kind: "schedule_conflict"` dentro de `generateNudgesForUser`. Zero infraestrutura nova: reutiliza teto diário, horário útil, dedupe e dispatch.

`dedupe_key` = `schedule_conflict:<idA>:<idB>:<YYYYMMDD>` com os ids ordenados — garante 1 aviso por par por dia, independentemente da ordem em que aparecem.

### 4. Formato da mensagem
> Tens dois compromissos ao mesmo tempo amanhã às 10:30: “Visita T2 Canelas” e “Reunião de equipa”. Queres remarcar algum?

Regras: nomeia sempre os dois títulos e a hora de sobreposição, usa dia relativo (hoje/amanhã/quinta), e termina com uma pergunta de ação. Nunca linguagem de erro.

### 5. Repetição
Repete **no máximo 1x por dia** enquanto o conflito existir, com limite de **3 avisos** para o mesmo par. Ao terceiro sem resolução, deixa de insistir e fica um item em Diversos (“Por tratar”) — mesmo padrão já usado nos nudges de documentação em falta.

### 6. Conflitos resolvidos
Desaparecem sozinhos: o conflito é recalculado a cada ciclo a partir dos compromissos atuais. Se um for cancelado, arquivado ou movido, o par deixa de aparecer e o nudge pendente é marcado como resolvido automaticamente.

### 7. Retroativo
Sim — as sobreposições já existentes entram no primeiro ciclo depois de publicar, sujeitas ao teto diário de 3 nudges. São conflitos reais e o consultor deve sabê-los.

## Implementação (quando aprovares)

1. `src/lib/agenda/conflicts.ts` — módulo puro: recebe compromissos com janela, devolve pares em conflito. Golden tests para sobreposição parcial, encostados, dia inteiro, séries duplicadas.
2. `src/lib/agenda/conflict-message.ts` — texto PT-PT com dia relativo e hora da colisão.
3. `generateNudgesForUser` — novo bloco `schedule_conflict` (janela de 14 dias, teto de 3 avisos por par, escoamento para Diversos).
4. Resolução automática dos nudges cujo par deixou de colidir.
5. Linha nova em `product_updates` e memória da funcionalidade.
