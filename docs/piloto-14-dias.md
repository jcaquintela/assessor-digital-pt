# Piloto 14 dias — Relatório de aptidão

## Objetivo
Validar com um consultor real, durante 14 dias, o conceito de "assessor pessoal digital" — sem CRM, sem conversar com clientes, sem WhatsApp nesta fase.

## O que funciona ponta-a-ponta

- **Chat com o assessor** (`/assessor`): histórico persistente em `assessor_messages`, com estados `draft`, `confirmed`, `cancelled`.
- **Parser PT-PT** (`src/lib/assessor/parser.ts`): extrai nome de pessoa ("ao/à/com o/a"), data (hoje, amanhã, dias da semana, "15 de agosto", "20/08"), hora ("10h30", "às 15h"), valor ("38,50€", "4.500 euros") e categoria (portagens → Deslocação, etc.). Nunca inventa.
- **Cartões editáveis** para seguimento, despesa, comissão e conversa. O consultor pode alterar todos os campos antes de confirmar.
- **Resolução de pessoa**: se o nome extraído coincidir com alguém já registado, sugere ligação; caso contrário, oferece "Criar pessoa X".
- **Briefing real** e **pesquisa real** consultam a base de dados do consultor.
- **CRUD**: Pessoas, Seguimentos, Despesas, Comissões — criar, ler, atualizar e eliminar via `store.tsx`.
- **Isolamento por consultor**: todas as tabelas com `FORCE ROW LEVEL SECURITY` e políticas ligadas a `auth.uid()`.

## Segurança

- `user_roles` só pode ser escrito por administradores (`is_admin(auth.uid())`), fechando a escalada de privilégios.
- Perfis, pessoas, oportunidades, imóveis, seguimentos, interações, movimentos financeiros e mensagens do assessor: RLS forçado.
- `assessor_messages` isolado por `user_id`.

## O que continua fora do âmbito (por desenho)

- WhatsApp, OpenAI, Google Calendar, Microsoft Outlook, Stripe — pontos de integração identificados no código, mas desligados.
- Reconhecimento de voz real (botão áudio simulado).
- Faturação certificada — a área "O Meu Negócio" é indicativa, não substitui contabilidade.

## Checklist de aptidão

- [x] Registar seguimento, despesa, comissão e conversa via chat
- [x] Editar cartão antes de confirmar
- [x] Histórico do chat persiste após fechar e reabrir o browser
- [x] Briefing "hoje" reflete dados reais do consultor
- [x] Pesquisa varre pessoas, oportunidades, seguimentos e imóveis reais
- [x] Aviso visível de que a aplicação está em piloto
- [x] Distinção Conta real / Conta demonstração em Definições
- [x] Painel `/admin` protegido, sem acesso a dados privados por defeito

## Riscos conhecidos para o piloto

- O parser é regex-based; frases muito ambíguas caem em "conversa" e o consultor tem de escolher a ação manualmente.
- Anexos e áudio ainda não estão persistidos.
- Reagendamento apenas para "amanhã" no ecrã Seguimentos (edição fina no cartão do chat).