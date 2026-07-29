## O que os dados mostram

`miscellaneous_items` tem **uma única linha** para o teu utilizador ("Apaga tudo que temos para hoje", de ontem, com estado `deleted`). Nenhuma mensagem de hoje caiu em Diversos.

Ao mesmo tempo, os registos de actividade de hoje mostram pelo menos dois turnos falhados que deviam ter deixado rasto:
- 14:40:37 — prospeção confirmada mas não criada (`not_created`)
- 13:50:32 — turno do motor terminado sem sucesso

Todos os teus turnos correm no motor v3. A correcção que fiz na conversa anterior foi no motor antigo, que não é o teu — por isso não mudou nada para ti.

## Diagnóstico (a confirmar no primeiro passo)

No motor v3, a rede de segurança que grava em Diversos parece estar ligada apenas ao atalho das comissões. Os restantes caminhos de saída — ferramenta que falha durante a decisão, prospeção que não é criada, e o turno em que o assessor simplesmente não percebe e responde "Não percebi bem essa parte" — aparentam devolver a resposta ao utilizador sem gravar nada. Isto ainda não está confirmado linha a linha; é o primeiro passo do plano.

## Plano

**1. Auditar todos os pontos de saída do motor v3**
Percorrer o ficheiro do motor de raciocínio e listar cada ponto onde uma resposta é devolvida ao consultor. Para cada um, classificar: acção executada com sucesso, acção falhada, ou não compreendido. Só depois disto se fecha o diagnóstico.

**2. Rede de segurança única e obrigatória**
Criar um único ponto de passagem no fim do motor v3 que, antes de devolver qualquer resposta, decide se a mensagem tem de ficar guardada em Diversos:
- ferramenta executou com sucesso → não guarda
- ferramenta falhou (qualquer uma, não só financeiro) → guarda
- motor não percebeu / respondeu com fallback → guarda
- confirmação/rejeição curta ("sim", "ok", "não") e saudações → não guarda
- consultas ("o que tenho hoje?") → não guarda

Guarda o texto original, o canal, e a razão da falha, com estado "por tratar".

**3. Fechar o buraco da prospeção não criada**
O caso das 14:40 (`not_created`) devolve mensagem de erro ao consultor sem guardar nada. Passa a usar a rede de segurança do ponto 2.

**4. Resposta honesta ao consultor**
Sempre que algo for para Diversos, a resposta diz onde ficou, em linguagem natural: *"Não percebi bem, mas deixei em Diversos para não se perder."* Nunca uma falha silenciosa.

**5. Testes**
Acrescentar testes ao conjunto existente que cubram: ferramenta falhada grava em Diversos; fallback de não-compreensão grava em Diversos; "sim" e "bom dia" não gravam; sucesso não grava.

**6. Validação real**
Enviar mensagens de teste pelos dois caminhos (falha de ferramenta e não-compreensão) e mostrar o conteúdo real da tabela depois, linha a linha, como agora.

## Detalhe técnico

- Ficheiro principal: `src/lib/assessor/v3/reasoning-engine.server.ts`
- A função `saveFailedActionAsMiscellaneous` já existe e é reutilizada; passa a ser chamada a partir de um único wrapper de saída em vez de num só ramo
- Reutiliza os detectores já existentes em `src/lib/assessor/culture/short-answers.ts` para excluir confirmações e saudações
- Escrita em `miscellaneous_items` com `status: 'inbox'`, `source_channel` e `source_message_id` preenchidos, para a entrada ser rastreável até à mensagem original
- Sem alterações de esquema na base de dados
