# Consultor Assistente

Cria um MVP funcional chamado “Assessor do Consultor” para testar o conceito de um assessor pessoal digital para consultores imobiliários.

Princípios: não é CRM, não fala com clientes, serve apenas o consultor, deve funcionar sem WhatsApp nesta fase, mas ficar preparado para receber mensagens por WhatsApp no futuro. É uma única webapp responsiva: em mobile abre em /assessor com experiência conversacional; em desktop abre em /hoje com dashboard.

Mobile: Assessor, Hoje, Seguimentos, Mais. Desktop: Hoje, Assessor, Pessoas, Oportunidades, Imóveis, Seguimentos, Calendário, Documentos, O Meu Negócio, Definições.

Criar interface de chat com texto, botão de áudio simulado, anexos e ações rápidas: Registar conversa, Criar seguimento, Registar despesa, Registar comissão, O que tenho hoje?, Procurar informação. As respostas devem surgir como cartões estruturados com Confirmar, Editar e Cancelar.

Dashboard Hoje: briefing diário, compromissos, seguimentos do dia, atrasados, oportunidades sem próxima ação, prioridades, indicadores simples. Evitar gráficos decorativos.

Pessoas: nome, telefone, email, relação, resumo, histórico, oportunidades, imóveis, seguimentos, documentos, próxima ação.
Oportunidades: compra, venda, potencial angariação, arrendamento, investimento, recomendação; pessoa, estado, valor, probabilidade simples, próxima ação, data e notas.
Imóveis: título/morada curta, tipo, localização, valor, estado, proprietário, oportunidade, notas e documentos.
Seguimentos: distinguir tarefa com prazo de evento com hora. Permitir criar, concluir, reagendar e priorizar. Vistas Hoje, Esta semana, Atrasados, Concluídos.
Calendário: calendário interno e área para futura ligação a Google e Microsoft.
Documentos: upload e associação.
O Meu Negócio: visão geral, comissões, faturação, despesas e rentabilidade. Mostrar faturado, recebido, por receber, despesas e resultado antes de impostos. Não tratar como contabilidade certificada.

Arquitetura: camada de entrada independente do canal; guardar canal, conteúdo original, transcrição futura, interpretação, confirmação e ações. Dados demo realistas de consultor português. EUR, datas e idioma PT-PT.

Design: profissional, humano, sóbrio, moderno, muito espaço em branco, sem aspeto de CRM pesado. Mobile focado em captura; desktop em controlo.

Nesta iteração: app navegável e funcional com dados demo; sem OpenAI, WhatsApp, Google Calendar, Outlook ou Stripe; deixar pontos de integração identificados no código.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://assessor-digital-pt.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/bf908ebc-1146-4c4f-a804-92bbc45c4e1a).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
