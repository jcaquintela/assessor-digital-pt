# Apagar qualquer negócio, sempre

Hoje um negócio só pode ser apagado se estiver arquivado e se não tiver comissões nem despesas lançadas. Passa a poder ser apagado sempre.

## O que muda para ti

- Na ficha de um negócio, "Eliminar definitivamente" fica sempre disponível — arquivado ou não.
- Deixa de haver o aviso a dizer que o negócio não pode ser apagado por ter dinheiro associado.
- Ao apagar, vai junto tudo o que pertence ao negócio: comissões, despesas, prazos, eventos e as ligações a imóveis. Pessoas, imóveis, seguimentos e interações não são apagados — só perdem a ligação ao negócio.
- Continua a ser preciso escrever o motivo e confirmar. Antes de apagar fica guardado um retrato completo do negócio e dos valores no registo de auditoria, para se conseguir saber depois o que existia.
- O aviso da janela de confirmação passa a dizer, em números, o que vai desaparecer (por exemplo: "3 comissões, 2 despesas, 1 prazo").

Pessoas e imóveis mantêm as regras atuais: esta alteração é só para negócios.

## Detalhes técnicos

- `src/lib/records/entity-delete.server.ts`, `assessEntityDeletion`, ramo `opportunity`: deixar de adicionar `BLOCKED_MESSAGE_DEAL` quando há `financial_movements`; passar essas linhas para `cascade` (comissões e despesas contadas em separado, pelo campo que distingue o tipo de movimento).
- `permanentlyDeleteEntity`: para `type === "opportunity"`, saltar a verificação `if (!assessment.archived) throw NOT_ARCHIVED_ENTITY_MESSAGE` (mantém-se para pessoa e imóvel); acrescentar `await del("financial_movements", "opportunity_id")` antes das restantes eliminações.
- Snapshot de auditoria: incluir as linhas de `financial_movements` em `extra` (à semelhança de `person_phones` na anonimização), para que a eliminação continue reconstituível.
- `src/lib/records/entity-delete.ts`: `canDelete` para negócios passa a `!blocked` (sem exigir `archived`); manter a exigência para os outros tipos.
- UI: `src/components/records/use-entity-delete.tsx` e `permanent-delete-dialog.tsx` já mostram `cascade` e `canDelete`, por isso não precisam de lógica nova; confirmar apenas que o texto de aviso destaca os movimentos financeiros.
- Testes: atualizar `src/lib/records/entity-delete.golden.test.ts` (o teste "bloqueia sem exceção"/"bloqueia por movimentos" para negócio passa a esperar eliminação permitida) e acrescentar dois testes: negócio não arquivado com comissões é eliminado com sucesso, e os movimentos financeiros ficam no snapshot de auditoria.
- Registar uma linha em `product_updates` (categoria melhoria) a dizer que qualquer negócio pode agora ser eliminado.
