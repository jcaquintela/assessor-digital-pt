# AFONSO AI 2.0 — inventário, plano por dependências e estado (14/11/2026)

Correção fundamental: o Afonso **não é um CRM**. É "O teu copiloto de produtividade imobiliária" em WhatsApp e Telegram, preparado para integrar CRM externos com autorização. Portal web V2 só conta, subscrição, integrações, privacidade e exportação; cockpit admin separado.

Nada aqui foi publicado, nenhum interruptor foi ligado, nenhum utilizador foi contactado, nenhuma conta, pagamento ou dado de produção foi alterado, nenhuma migração de base de dados foi feita nesta sessão.

## 1. Inventário V1/V2 (estado verificado)

| Área | V1 (em produção, partilhada) | V2 (desenvolvimento) |
|---|---|---|
| Canais | WhatsApp + Telegram, motor v3 (fallback v2/legado) | conversa partilhada `assessor.cross_channel.v1` (OFF) |
| Web consultor | ~37 páginas comerciais (Hoje, Pessoas, Imóveis, Negócios, Oportunidades, Agenda, Drive…) | portal mínimo `v2.minimal_portal.v1` (OFF) — novo |
| Admin | ~37 páginas, RBAC super/support admin, auditoria | página "AFONSO 2.0 — decisões e gates" (só leitura) — novo |
| Acesso | contas legadas | Early Access + convites + piloto (flags OFF) |
| Pagamentos | Stripe; checkout novo OFF; teste nunca toca contas reais; eventos antigos ignorados | plano único 29 € — só regras puras |
| Proatividade | `assessor_nudges` único | teto 1/dia global (OFF); oportunidades OFF globalmente |
| Dados | 105 tabelas, todas com RLS | inventário migrar/exportar/reter/excluir; exportação ZIP (OFF) — novo |

Isolamento V1/V2: base e código partilhados. A V2 só existe atrás de interruptores por conta que, com `pilot.v2_entitlement.v1`, exigem participação ativa no piloto. Os dois interruptores novos (`v2.minimal_portal.v1`, `v2.self_export.v1`) não existem na base → desligados para todos; foram juntos a `PILOT_GATED_FLAGS`.

Auditoria de isolamento (catálogo, só leitura, 14/11/2026): 105/105 tabelas públicas com RLS; nenhuma política aberta a `anon`/`authenticated` além de planos publicados, anúncios ativos e novidades publicadas (intencional); funções privilegiadas executáveis por utilizadores só `has_role`, `is_admin`, `effective_tier`, todas recusam consultar outra conta. Não substitui um teste E2E entre contas.

## 2. Plano por dependências

1. Salvaguardas (pagamentos teste/live, ordem de webhooks, RLS, idempotência) — feitas e testadas em unitários.
2. Isolamento da V2 por interruptor + entitlement de piloto — feito.
3. Regras V2 puras (subscrição, referências, gates, CRM externo) — feitas nesta sessão.
4. Superfícies V2 desligadas (portal mínimo, exportação, cockpit) — feitas nesta sessão.
5. Ambiente de testes independente → E2E isolamento + canais — **bloqueado** (projeto e segredos `TEST_SUPABASE_*`).
6. Plano único 29 € no Stripe, ligar ciclo de vida ao acesso real, tabela de créditos — requer autorização.
7. G1 → G2 → G3 → G4, cada um com autorização expressa.

## 3. Código alterado nesta sessão

- `src/lib/v2/portal-scope.ts`, `portal.functions.ts`, `src/routes/_authenticated/route.tsx`: portal mínimo; com o interruptor desligado ou qualquer falha, V1 igual a hoje.
- `src/routes/_authenticated/conta.tsx`, `privacidade.tsx`, `src/components/v2/portal-shell.tsx`.
- `src/lib/v2/export/bundle.ts`, `export.functions.ts`: ZIP do titular (dados JSON/CSV, documentos originais, LEIA-ME, manifesto com contagens, datas, falhas e SHA-256), lido com o cliente do titular (RLS) e montado no browser.
- `src/lib/v2/subscription-lifecycle.ts`: 29 €/mês, trial 14 dias na 1.ª ação útil, tolerância 7 dias, fim do período pago, exportação 30 dias, sem quotas. Não ligado ao acesso real.
- `src/lib/v2/referrals.ts`: 29 € de crédito, nunca dinheiro, antifraude.
- `src/lib/integrations/crm/port.ts`: porta para CRM externo, sem conectores, consentimento individual, escrita só com aprovação.
- `src/lib/v2/gates.ts`, `decisions.ts`, `src/routes/admin/v2.tsx`: 4 gates (todos NO-GO, 0 autorizações) e estado das 50 decisões.
- `src/lib/pilot/pilot.ts`: novos interruptores pilot-gated.

## 4. Pendências e bloqueios

- Ambiente de testes independente e E2E reais (isolamento entre contas, WhatsApp, Telegram) — bloqueado.
- Exportação: fluxo real com dados não exercitado (interruptor desligado); eliminação ainda por pedido manual.
- Portal V2: páginas Subscrição/Canais/Definições ainda usam o menu V1 (os links comerciais redirecionam para /conta).
- Trial V1 começa na 1.ª mensagem comercial válida; a regra V2 (1.ª ação útil) está pronta mas não ligada.
- Antecedência do aviso de mudança de preço e dias de retenção da referência — decisão do proprietário.
- Decisões em plano/bloqueadas: ver página admin ou `src/lib/v2/decisions.ts`.
