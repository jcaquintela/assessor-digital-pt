
# Redesenho do `/hoje` como Centro de Comando

Transformar a página inicial num centro de comando acionável, sem duplicar o CRM. Reutilizar o motor Supremo v1 já implementado (prioridades, aguardam-resultado, autonomia, motor conversacional do Assessor). Ativação sem depender da feature flag Supremo — o novo dashboard passa a ser a experiência-padrão, com fallback para dados demo (`useStore`) quando o motor real não devolve nada.

## 1. Página `/hoje` — cinco blocos

Reescrever `src/routes/_authenticated/hoje.tsx`:

**A. Cabeçalho diário**
- Saudação temporal (Bom dia/Boa tarde/Boa noite) + nome do consultor.
- Frase natural: "Hoje tens N prioridade(s) e M compromisso(s)."
- Data por extenso (PT-PT).
- Botões: `Falar com o Alfred` (→ `/assessor`) e `Adicionar` (abre popover).

**B. As minhas prioridades** (máx. 5)
- Fonte: `getHojeSupreme` → fallback para prioridades derivadas de seguimentos/oportunidades locais quando vazio ou motor desligado.
- Cartão com título, tipo, hora/prazo, entidade, motivo curto.
- Ações inline: `Concluir`, `Adiar`, `Abrir`, `Falar`. `Concluir`/`Adiar` chamam `saveFollowUpOutcome` para follow-ups; para oportunidades, `Abrir` navega à ficha. `Adiar` mostra popover com opções (+1h, amanhã, próxima semana) — apenas UI nesta iteração usando o campo `dismissed_at`/refresh; adiamento profundo fica marcado como TODO.
- Estado vazio: "Nenhuma prioridade urgente."

**C. Próximos compromissos (timeline)**
- Lista cronológica dos eventos de hoje (fonte: `follow_ups` tipo Evento + fallback demo).
- Cada item: hora, título, pessoa, imóvel, estado.
- Click → drawer lateral (shadcn `Sheet`) com contexto: última interação, notas, botões "Abrir ficha da pessoa", "Abrir imóvel", "Registar resultado".

**D. Aguardam resultado**
- Fonte: `supreme.awaitingOutcome` + fallback local (eventos passados sem outcome).
- Cartão com título, quando aconteceu, entidade.
- 4 ações rápidas: `Correu bem` (→ `concluido`), `Precisa seguimento` (→ `precisa_nova_acao`), `Sem efeito` (→ `nao_realizado`), `Nota` (abre modal simples para `outcome_notes`).
- Depois de responder → invalidar query; item desaparece.

**E. Alertas úteis** (só aparece se houver conteúdo)
- Seguimentos em atraso (contagem + link).
- Oportunidades sem próxima ação.
- Documentos por classificar (`uploaded_files` com `classification` null, apenas contagem + link para `/documentos`).
- Cada alerta é clicável e leva à listagem filtrada. Sem cartões vazios.

## 2. Ações rápidas (botão `Adicionar`)

Popover no cabeçalho com opções: Pessoa, Imóvel, Compromisso, Seguimento, Despesa, Comissão, Nota. Cada opção navega para a rota correspondente (`/pessoas`, `/imoveis`, `/seguimentos`, `/negocio/despesas`, `/negocio/comissoes`, `/diversos`). No topo, campo "O que queres registar?" que, ao submeter, navega para `/assessor?prefill=<texto>` — o Assessor mobile já reutiliza o motor central.

## 3. Pesquisa global

Componente `GlobalSearch` no `PageHeader` do `/hoje` (e futuramente noutras páginas):
- Input com `Cmd+K` opcional.
- Pesquisa em `people.name`, `properties.title`, `miscellaneous_items.title`, `follow_ups.title` (queries paralelas, limit 5 cada).
- Resultados agrupados por tipo com ícone e link para ficha. Debounce 250ms.

## 4. Navegação

Reduzir `desktopNav` em `src/components/app-shell.tsx` para:
- Hoje, Assessor, Pessoas, Imóveis, Agenda (`/calendario`), O Meu Negócio, Diversos, Definições.
- Remover do menu: Oportunidades, Seguimentos, Rotinas, Interações, Documentos (mantêm rotas + ficam acessíveis via fichas, pesquisa e link "ver mais" dentro de `/hoje`).
- `mobileNav`: Assessor, Hoje, Pessoas, Mais.

## 5. Fichas
Já existem (`/pessoas/$id`, `/imoveis/$id`). Esta iteração garante que cada cartão do dashboard tem link para a ficha correspondente. Melhorias profundas às fichas ficam fora do âmbito.

## 6. Detalhes técnicos
- Novo componente `src/components/hoje/*` (Header, PrioritiesBlock, Timeline, AwaitingBlock, AlertsBlock, QuickAdd, EventDrawer, GlobalSearch).
- Todas as ações usam `useMutation` + `invalidateQueries(["supreme","hoje"])`.
- Estado vazio explícito em cada bloco.
- Responsivo: 2 colunas em desktop (prioridades + timeline à esquerda, aguardam+alertas à direita), 1 coluna em mobile com FAB `Falar com o Alfred`.
- Tokens semânticos existentes (`bg-card`, `border-border`, `text-primary`); sem cores hardcoded.

## 7. Fora do âmbito (para não inflar esta iteração)
- Redesenho profundo das fichas de pessoa/imóvel/compromisso.
- Integração real com Google/Outlook.
- Novo motor de linguagem natural no botão "Adicionar" (usa o Assessor já existente).
- Melhorar performance de pesquisa com índices dedicados.

## 8. Critérios de aceitação
1. Abrir `/hoje` mostra imediatamente prioridades, compromissos, aguardam-resultado, alertas.
2. Concluir/adiar prioridade sem mudar de página.
3. Cartões clicáveis com contexto no drawer ou ficha.
4. Registar resultado num compromisso (correu bem / precisa seguimento / sem efeito / nota).
5. Botão `Adicionar` com opções rápidas + campo linguagem natural.
6. Pesquisa global funcional.
7. Menu principal reduzido.
8. Nenhum cartão vazio decorativo.
9. Build + testes verdes.
