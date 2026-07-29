
## Wireframe textual da página Hoje

### Mobile (uma coluna)

```text
┌─────────────────────────────────────────┐
│ Bom dia, Júlio.                         │
│ Hoje tens 2 compromissos e 3 prioridades│
│ quarta-feira, 29 de julho               │
│ [Falar com Alfred]   [+ Adicionar]      │
├─────────────────────────────────────────┤
│ 🔎 Pesquisa pessoas, imóveis, notas…    │
├─────────────────────────────────────────┤
│ AS MINHAS PRIORIDADES                   │
│ ┌─────────────────────────────────────┐ │
│ │ Preparar visita com Paulo           │ │
│ │ 15:00 · Rua Sá da Bandeira · atraso │ │
│ │ [Concluir] [Adiar] [Abrir] [Falar]  │ │
│ └─────────────────────────────────────┘ │
│ (até 5 cartões)                         │
├─────────────────────────────────────────┤
│ PRÓXIMOS COMPROMISSOS                   │
│ 15:00 · Visita T3 Boavista · Paulo   ›  │
│ 17:30 · Avaliação · Sofia            ›  │
├─────────────────────────────────────────┤
│ AGUARDAM RESULTADO                      │
│ Visita ontem · Ana Silva                │
│ [Correu bem][Seguimento][Sem interesse] │
│ [Nota]                                  │
├─────────────────────────────────────────┤
│ ATENÇÃO (só se existir)                 │
│ 3 seguimentos em atraso              ›  │
│ 2 documentos por classificar         ›  │
└─────────────────────────────────────────┘
        [ Falar com Alfred ]  (FAB fixo)
```

### Desktop (duas colunas)

```text
┌───────────────────────────────────────────────────────────────┐
│ Bom dia, Júlio.  Hoje: 2 compromissos · 3 prioridades         │
│ [Falar com Alfred]                          [+ Adicionar]     │
│ 🔎 Pesquisa pessoas, imóveis, notas ou compromissos           │
├────────────────────────────────┬──────────────────────────────┤
│ AS MINHAS PRIORIDADES (5)      │ AGUARDAM RESULTADO           │
│ [cartões clicáveis com ações]  │ [itens com ações rápidas]    │
│                                │                              │
│ PRÓXIMOS COMPROMISSOS          │ ATENÇÃO                      │
│ timeline cronológica clicável  │ apenas alertas ativos        │
│ → abre drawer lateral com      │                              │
│   pessoa, imóvel, docs, notas, │                              │
│   localização, histórico       │                              │
└────────────────────────────────┴──────────────────────────────┘
```

Navegação principal reduzida: **Hoje · Pessoas · Imóveis · Agenda · O Meu Negócio · Diversos · Definições**. Seguimentos, Oportunidades, Interações, Ficheiros e Rotinas passam a ser acessíveis a partir de fichas, pesquisa, filtros e cartões de /hoje (não desaparecem, deixam o menu principal).

## Componentes reutilizados (sem alteração visual estrutural)

- `AppShell` (só ajuste da lista de navegação).
- `GlobalSearch` (`src/components/hoje/global-search.tsx`).
- `QuickAdd` (`src/components/hoje/quick-add.tsx`) — já cobre o menu "Adicionar" + campo de linguagem natural.
- `EventDrawer` (`src/components/hoje/event-drawer.tsx`) para compromissos.
- Cartões de Prioridades, Aguardam resultado e Alertas já existentes em `hoje.tsx` (mantêm lógica de mutações `outcome`, `dismiss`, `snoozePriority`).
- Fichas `/pessoas/$id`, `/imoveis/$id`, `/seguimentos/$id`, `/oportunidades/$id` — sem alterações.

## Componentes a redesenhar / remover

- `hoje.tsx`: remover a grelha **Módulos** (Pessoas/Imóveis/Agenda/Seguimentos/Oportunidades/Negócio/Diversos/Rotinas) e a faixa "Escolher nome do Assessor" da coluna lateral. O dashboard fica só com os 5 blocos (Cabeçalho, Prioridades, Compromissos, Aguardam resultado, Atenção). Cabeçalho passa a mostrar data por extenso e limpar contadores decorativos.
- `AppShell` (`src/components/app-shell.tsx`): reduzir a navegação desktop e a bottom-bar mobile ao core (Hoje, Pessoas, Imóveis, Agenda, O Meu Negócio, Diversos, Definições). Manter FAB "Falar com Alfred" no mobile.
- `EventDrawer`: garantir que expõe pessoa, imóvel, documentos, notas, localização, histórico e próximas ações (adicionar secções em falta se necessário — leitura antes de editar).
- Estados vazios: substituir textos genéricos pelas frases pedidas ("Não tens compromissos para hoje.", etc.) e esconder cartões inteiros quando não há dados (regra "sem cards vazios").

## Canais conversacionais (WhatsApp + Telegram)

Camada nova `src/lib/assessor/channels/` com:

- `interactive.ts`: tipo `AssistantReply = { text: string; options?: { id: string; label: string }[] }` e helper `buildOptions()`.
- `whatsapp.ts`: envio via WhatsApp Cloud API usando `interactive` (reply buttons até 3, list message quando >3), fallback para opções numeradas na mesma mensagem quando fora da janela de 24h ou sem template aprovado.
- `telegram.ts`: envio com `inline_keyboard`; `callback_data` = id curto opaco (sem PII), resolvido via tabela `channel_callbacks` (id → intent + subject_id + expiry).
- Webhooks (`src/routes/api/public/whatsapp-webhook.ts` já existe; adicionar equivalente Telegram `telegram-webhook.ts`) tratam clique em botão como mensagem de texto equivalente ao label, entrando no motor v3 como qualquer resposta livre. Regra: **as opções aceleram, nunca limitam** — utilizador pode escrever texto livre e o motor interpreta.
- Pontos onde o motor propõe opções: proposta de agenda (Registar/Alterar/Cancelar), pergunta de lembrete (15 min/30 min/1 hora/Personalizar), ficheiro recebido (Criar imóvel/Associar/Diversos), pós-evento (Correu bem/Criar seguimento/Sem interesse/Escrever nota).

## Rotas afetadas

- `src/routes/_authenticated/hoje.tsx` — redesenho conforme wireframe.
- `src/routes/_authenticated/route.tsx` / `app-shell.tsx` — nova navegação.
- `src/routes/api/public/whatsapp-webhook.ts` — suporte a `interactive` payloads inbound.
- `src/routes/api/public/telegram-webhook.ts` — **novo**.
- `src/lib/assessor/v3/act.server.ts` (ou equivalente na camada de resposta) — passar `options` do motor para o adapter de canal.
- Sem alterações em `/pessoas`, `/imoveis`, `/agenda`, `/negocio`, `/diversos`, `/definicoes` além de garantir que continuam alcançáveis.

## Ordem de implementação

1. Reduzir navegação (`AppShell`) e limpar `hoje.tsx` (remover Módulos + faixa nome).
2. Ajustar cabeçalho, estados vazios e drawer de compromissos.
3. Camada `channels/interactive.ts` + adapter WhatsApp com reply buttons e fallback numerado.
4. Adapter Telegram + webhook + tabela `channel_callbacks`.
5. Ligar opções aos momentos-chave do motor v3 (agenda, lembretes, ficheiros, pós-evento).
6. QA manual mobile/desktop contra os 12 critérios de aceitação.

Confirma este plano (ou aponta ajustes) e avanço com a implementação.
