# Action-first na qualificação de compradores (cenário Miguel)

Desenvolvimento apenas, atrás de um interruptor desligado. Não publica e não mexe em interruptores, dados de consultores nem produção.

## Decisões necessárias antes de implementar
1. **Regra "uma pergunta de cada vez"** (regra base do produto) e regra da identidade ("senão, uma única pergunta"). O requisito (1) pede para agrupar as perguntas essenciais em 1 ou 2 turnos.
   - Proposta: exceção só para a qualificação de compradores. Uma única mensagem com no máximo 3 perguntas curtas, sempre acompanhada de uma ação já feita. Em tudo o resto, mantém-se a regra.
2. **"Prompts inalterados até 100 evals verdes".** A mudança mexe nas instruções do motor.
   - Proposta: as instruções novas só correm com o interruptor ligado. O original fica intacto e a bateria de evals cresce com este cenário. Ligar para alguém exige a bateria verde.
3. **Pesquisa em portais para compradores.** Hoje só existe pesquisa de anúncios semelhantes a um imóvel, a pedido, limitada a 10 por dia por conta, e o Zome não está na lista de sites.
   - Proposta: reutilizar essa pesquisa, com o mesmo limite diário, para compradores.
   - Por decidir: incluir o site público da Zome na lista.

## Ponto de partida (verificado no código)
- O motor escolhe entre perguntar e executar, e nunca as duas coisas no mesmo turno. Só executa com confiança muito alta, por isso pergunta muito antes de agir.
- A ficha do comprador guarda zona, tipologia e orçamento mínimo e máximo. Não guarda prazo nem financiamento, nem distingue o que foi confirmado do que foi assumido.
- **Carteira própria:** o cruzamento só está nos avisos proativos, não como resposta direta.
- **Portais:** a pesquisa devolve título, site e link. Não traz preço, tipologia, referência nem confirmação de que o anúncio ainda existe.
- Não há ligação à carteira da Rede (Zome/ZMPT), nem leitura de referências ZMPT.
- Não encontrei a conversa do Miguel na base de dados. O desenho parte da tua descrição.

## O que muda (com o interruptor ligado)

### Comportamento
1. **Critérios mínimos = tipologia + zona + orçamento aproximado.** Com estes três, o Afonso age no mesmo turno:
   - cruza com a carteira própria;
   - se autorizado, pesquisa nos portais;
   - junta numa única mensagem as perguntas que faltam (no máximo 3).
2. **Confirmado vs assumido.** Cada critério fica marcado como confirmado ou assumido.
   - Exemplo assumido: teto ≈ 150k de pré-aprovação + parte dos 15k, já contando impostos e escritura.
   - O que já foi dito nunca volta a ser perguntado. Se o consultor corrigir, atualiza-se e diz-se o que mudou.
3. **Urgência** (prazo a 21 dias ou menos, como 30/11). Gera prioridade e um plano em paralelo, sem interromper a pesquisa:
   - o que já foi pesquisado;
   - o que falta e quem trata;
   - verificar a validade da pré-aprovação;
   - visitas a propor.
4. **Proposta de imóvel**, sempre com:
   - link direto clicável;
   - origem (carteira própria ou nome do portal);
   - referência ZMPT, se existir;
   - preço, tipologia e localização;
   - distância ao metro só se verificada, senão "por confirmar";
   - estado e disponibilidade, verificado ou "por confirmar";
   - 1 linha a explicar porque encaixa.

   Também na proposta:
   - Sem link real vindo de uma pesquisa, o imóvel não é proposto.
   - Nunca são mostradas imagens.
5. **Sem acesso à Rede.** O Afonso diz-o com estas palavras: "Não tenho acesso à carteira da Rede. Manda-me referências ZMPT ou links e eu analiso." Nunca diz que pesquisou onde não pesquisou.
6. **Terceiros** (comprador, outras agências): nada sai sem aprovação explícita. Mantém-se o mecanismo atual.

### Proteções no texto final
- Um link na resposta que não venha de um resultado de pesquisa deste turno é retirado, e o imóvel é marcado como não confirmado.
- Afirmações como "pesquisei na carteira/Rede/portais" sem pesquisa feita são substituídas por uma resposta honesta. É o mesmo padrão já usado para "fica anotado".

## Testes
Testes automáticos com fakes, como os atuais do motor:
- **Primeira ação útil:** "Miguel, T1 Gaia, perto do metro, 150k, 15k, 30/11" → ação útil no 1.º turno. Em geral, 3 interações ou menos sempre que há critérios mínimos.
- **Faltam critérios:** só falta a zona → 1 mensagem com as perguntas agrupadas e sem perguntas em série. No 2.º turno, com a resposta, age.
- **Nada repetido:** confirmado vs assumido guardado, e o que já foi dito não volta a ser perguntado.
- **Urgência:** o prazo 30/11 gera plano e prioridade numa só mensagem, com a pesquisa feita.
- **Formato da proposta:**
  - todos os campos presentes;
  - "por confirmar" quando não verificado;
  - link inventado → retirado;
  - sem imagem.
- **Sem Rede:** frase honesta + pedido de referências ou links. Afirmar uma pesquisa falsa → substituído.
- **Terceiros:** zero envios sem confirmação explícita.
- **Recuo:** com o interruptor desligado, o comportamento e as instruções ficam iguais aos de hoje.
- Antes de ligar para alguém, juntar o cenário Miguel e variantes à bateria de evals com o modelo real.

## Impacto e riscos
- **Custo:** mais pesquisas em portais por conta, mas dentro do limite diário atual.
- **Anúncios desatualizados:** a pesquisa não confirma que o anúncio está ativo. Por isso o estado fica sempre "por confirmar".
- **Teto do comprador:** o assumido pode estar errado. É sempre mostrado como assumido e nunca é usado para excluir imóveis em silêncio.

## Detalhes técnicos
- **Interruptor** por conta, desligado: `assessor.action_first_qualification.v1`.
- **Módulo determinístico** `src/lib/assessor/qualification/`:
  - `buyer-brief.ts`: extrai os critérios e marca-os como confirmados ou assumidos; deteta urgência.
  - `minimum-criteria.ts`: decide se já se pode agir.
  - `proposal-format.ts`: formata a proposta de imóvel.
  - `url-provenance.ts`: só deixa passar links que vieram de uma pesquisa deste turno.
- **DECIDE:** novo modo `act_and_ask`, só com ferramentas de leitura e pesquisa. O texto novo das instruções só é injetado com o interruptor ligado.
- **Ferramenta nova** `search_listings_for_buyer`, que reutiliza `similar-listings.server.ts` (cache, limite diário, lista de sites, padrão de URL de anúncio). Extrai preço, tipologia e referência ZMPT do título e da descrição, com o estado "por confirmar".
- **Carteira própria:** reutilizar a correspondência estrita de `detector.ts` como leitura direta.
- **Guarda pós-resposta**, ao lado de `write-receipt.ts`:
  - links fora dos resultados → retirados;
  - afirmações de pesquisa falsas → substituídas.
- **Critérios:** guardados em `people.preferences.buyer_brief`, cada um com valor, estado e mensagem de origem, através do serviço de domínio. Sem migração. Alternativa: colunas novas aditivas, se preferires.
- **Testes:** ao lado dos atuais (`v3/*.test.ts`, padrão de `deal-e2e.test.ts`), mais entradas novas no golden runner.
