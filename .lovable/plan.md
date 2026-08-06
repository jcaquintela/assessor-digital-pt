# Corrigir "Fundir contas" e melhorar os botões de ação

## O que se passa

Confirmei duas causas reais:

1. **Os estilos do admin não chegam à janela.** Todas as regras visuais dos botões e campos do admin (`admin-btn`, `admin-btn-primary`, `admin-input`) estão definidas dentro do contexto `.admin-root`. A janela "Fundir contas" é desenhada fora dessa zona (é uma janela flutuante no topo da página), por isso os botões aparecem como texto simples, sem cor, sem contorno e — o mais importante — **sem qualquer sinal de que estão desativados**.

2. **O botão está desativado, não avariado.** "Fundir contas" só fica ativo depois de: escolher a conta que fica, clicar em "Pré-visualizar", e escrever um motivo com pelo menos 3 caracteres. Na captura, o motivo ainda é o texto de exemplo (cinzento, não escrito), logo o botão está bloqueado — mas como não há estilo, parece um botão normal que simplesmente não reage.

## O que vou fazer

**Tornar os botões visíveis e legíveis em qualquer janela**
- Aplicar o contexto visual do admin também às janelas flutuantes, para que botões e campos tenham o mesmo aspeto do resto do painel.
- Estado desativado passa a ser óbvio: cinzento, cursor bloqueado.

**Dizer sempre o que falta**
- Por baixo dos botões, uma linha curta que indica o passo em falta: "Escolhe a conta que fica", "Clica em Pré-visualizar", "Escreve o motivo da fusão".
- Numerar visualmente os três passos na janela (escolher conta → pré-visualizar → motivo).

**Reduzir atrito onde é seguro**
- Se já houver conta escolhida, a pré-visualização é calculada automaticamente (deixa de ser um clique obrigatório); o botão "Pré-visualizar" fica como recálculo manual.
- Motivo passa a ter sugestões de um clique ("Mesma pessoa: conta do WhatsApp e conta do painel"), continuando editável e obrigatório para a auditoria.

**Feedback claro na ação**
- Botão em estado "A fundir…" bloqueado durante a operação, mensagem de sucesso com o nome da conta que ficou, e erro legível em vez de mensagem técnica.

## Notas técnicas

- Adicionar a classe `admin-root` (ou equivalente) ao conteúdo das janelas usadas no admin — inclui `AccountMergeDialog` e o diálogo de criação de acesso, que sofrem do mesmo problema.
- Reforçar em `src/styles.css` o estado `:disabled` (opacidade + `pointer-events` mantidos) e garantir que a regra é alcançável fora do contentor do admin.
- Em `src/components/admin/merge-dialog.tsx`: derivar uma lista de motivos em falta a partir de `targetId`/`preview`/`reason`, mostrar no rodapé, e disparar `previewMerge` num efeito quando `targetId` muda.
- Sem alterações à lógica de fusão no servidor (`merge.functions.ts`, `merge_accounts_apply`).
