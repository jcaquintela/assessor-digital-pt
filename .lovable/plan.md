# Afonso 2.0 — simplificação do Super Admin e da web do consultor (só análise)

Nada é implementado nesta fase. Inventário baseado nas rotas reais (`src/routes`, menu `admin/nav.ts`).

## 1. Inventário atual

**Web pública (11):** `/` landing, `/registo`, `/entrar`, `/auth`, `/definir-password`, `/reset-password`, `/planos`, `/s/$code` (encurtador), `/oauth/*` + `/.lovable/oauth/consent` (OAuth Afonso), `/dev/ligar-canal` (teste), `/mcp`.

**Web do consultor (40 páginas em `_authenticated`)** — na prática um CRM paralelo:
- Conversa/painel: `assessor`, `hoje`, `briefing/detalhes`, `calendario`, `mais`, `sobre-a-ia`
- Registos: `pessoas`(+id), `imoveis`(+id), `negocios`(+id), `oportunidades`(+id), `prospecao`(+id), `seguimentos`(+id), `interacoes`(+id), `diversos`(+id), `rotinas`(+id), `grupos/$id`
- Ficheiros: `drive`(+id), `documentos`
- Financeiro: `negocio` (+comissões, despesas, faturação)
- Comunicação: `comunicacao` (+rascunho)
- Conta: `ligar-canal`, `definicoes`, `subscricao`

**Super Admin (37 páginas, 6 grupos):** Visão geral (2), Clientes (6), Comercial (4), Operação (5), Qualidade (11), Plataforma (4), além de páginas fora do menu: `consultor/$id`, `funcionalidades`, `integracoes`, `seguranca`, `auditoria`.

## 2. Redundâncias encontradas
- Convites em 3 sítios: `convites` (Telegram), `acesso-antecipado`, `beta`.
- Subscrições, faturação, planos e utilizadores mostram estado de plano em 4 páginas.
- Segurança dividida em `seguranca`, `auditoria`, `auditoria-seguranca`.
- Integrações divididas em `integracoes` e `integracoes-flags`.
- Qualidade com 11 páginas, metade ferramentas de depuração (`agenda-debug`, `simulador-briefing`, `diagnostico`, `rotas`, `painel-hoje`, `perfil-gotas`).
- Feedback e sugestões em duas páginas.
- Web do consultor duplica o que o Afonso já faz por conversa (criar pessoa/imóvel, seguimentos, rotinas, agenda, briefing).

## 3. Mapa depois

### Super Admin: 4 áreas
```text
Visão Geral    -> KPIs (contas, ativação, uso, conversão, custos, erros) + alertas
Utilizadores   -> Lista e ficha (consultor/$id): plano, beta, canais, acesso,
                  convites e lista de espera (unifica beta/convites/acesso
                  antecipado/entradas), suporte e feedback
Operação       -> Saúde (mensagens, entregas WhatsApp, avisos, erros de escrita),
                  qualidade (golden, autonomia, ações autónomas), custos,
                  comunicação/broadcast
Configuração   -> Planos & preços, subscrições/faturação (só leitura + links
                  Stripe), nome WhatsApp, definições
   Avançadas   -> flags, integrações, rotas v2, auditoria & segurança,
                  diagnóstico do motor, debug agenda, simulador briefing,
                  perfil por gotas, rastreabilidade
```
Resultado: de 37 para cerca de 12 ecrãs visíveis; o resto em "Avançadas", fechado por omissão, só super_admin.

### Web do consultor: 6 ecrãs
```text
/registo, /entrar  -> conta (com convite)
/ligar-canal       -> QR / deep link WhatsApp e Telegram, estado dos canais
/conta             -> dados, idioma, horário de silêncio, preferências mínimas
/subscricao        -> plano, Stripe Checkout e Portal, faturas
/privacidade       -> consentimentos, exportar dados, apagar conta
/suporte           -> contacto e estado
```
Mais as páginas técnicas que têm de existir: `oauth/*`, `/s/$code`, `reset-password`.

**Passam para a conversa** (já existem no motor): pessoas, imóveis, negócios, oportunidades, prospeção, seguimentos, interações, diversos, rotinas, calendário, briefing, comunicação/rascunhos, comissões, despesas, grupos.

**Riscos e exceções a decidir:**
- Ficheiros/Drive: ver um documento num link seguro de uso único, em vez de uma página de Drive.
- Financeiro (comissões/despesas/faturação): exportação CSV pedida por conversa, entregue num link seguro.
- Links do Afonso para fichas (`app.meuafonso.com/imoveis/id`) são usados nas propostas: tem de haver uma substituição (ficha só de leitura por link assinado) antes de retirar.
- Rascunhos de email aprovados na web (beta diário) passam a aprovação por conversa.
- Consultores habituados ao painel: retirada gradual com aviso e período de transição.

## 4. RBAC, Stripe e consentimento
- Papéis independentes mantidos: `super_admin`, `support_admin`, `consultant`. "Avançadas" só super_admin; support_admin vê Utilizadores e Operação sem alterar preços/flags.
- Toda a gestão de planos continua a ler `effective_tier()`.
- Stripe: Checkout e Portal mantêm-se como páginas externas seguras; webhook `api/public/payments/webhook` intocado; links de pagamento também pedidos por conversa (link assinado e de curta duração).
- Privacidade (RGPD): o consentimento, a exportação e o apagamento de dados têm de ficar na web, além da conversa. Notas confidenciais nunca são exportadas sem `dropConfidential()`.
- Acessibilidade: os 6 ecrãs com teclado, contraste e rótulos verificados.

## 5. Plano faseado

**Fase 0, quick wins (sem retirar nada)**
1. Reorganizar o menu admin nas 4 áreas + Avançadas (só a navegação).
2. Juntar convites, beta, acesso antecipado e entradas numa única aba de Utilizadores.
3. Juntar as 3 páginas de segurança e as 2 de integrações.
4. Medir a utilização real de cada página do consultor (há telemetria) durante 2 semanas.

**Fase 1, conta mínima do consultor**
5. Criar `/conta`, `/privacidade` e `/suporte`; `ligar-canal` e `subscricao` ficam como estão.
6. Links assinados de ficha (só leitura) para substituir `/imoveis/id` nas respostas.
7. Exportação CSV por conversa (financeiro, contactos).

**Fase 2, retirada gradual do CRM web** (atrás de uma flag por conta, desligada por omissão)
8. Nova navegação do consultor com os 6 ecrãs; páginas antigas redirecionam para a conversa, com uma mensagem explicativa.
9. Piloto com os beta testers; reversível desligando a flag. Nenhum dado é apagado.

**Fase 3, limpeza**
10. Retirar o código das páginas sem utilização há 30 dias, depois do piloto.

**Dependências:** convites e gate de acesso antecipado (implementados, flags desligadas); Fase 1 antes da 2 (links de ficha); decisão sobre Drive e financeiro.

## 6. Testes
- Navegação admin: cada rota continua acessível e cada uma pertence a exatamente uma área (estende `nav.test.ts`).
- RBAC: consultor sem acesso a `/admin`; support_admin sem acesso a "Avançadas" nem a preços.
- Flag desligada = navegação atual igual byte a byte; flag ligada = só os 6 ecrãs e redirecionamentos.
- Links assinados: expiram, são de uma só conta, só leitura.
- Stripe: Checkout, Portal e webhook inalterados (testes atuais de billing).
- Privacidade: a exportação exclui notas confidenciais; o apagamento pede confirmação.
- Acessibilidade: verificação automática nos 6 ecrãs.

## Decisões pedidas ao proprietário
1. Drive e documentos: link seguro por conversa, ou manter uma página só de leitura?
2. Financeiro: só exportação por conversa, ou uma página de resumo?
3. Data-alvo para a retirada do painel aos consultores atuais.
