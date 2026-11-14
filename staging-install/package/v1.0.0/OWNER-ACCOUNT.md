# Preservar a conta do proprietário no staging

**Objetivo.** A conta autorizada (email confirmado, papel `admin`) continua **exatamente** igual. Não há identidade recriada, nem escrita em `auth.users`, nem alteração da linha de `user_roles`.

**O email não está escrito neste pacote.** As consultas P04 e Q03 usam `__EMAIL_AUTORIZADO__`, que o operador substitui ao executar. Os resultados (impressões digitais md5) ficam no relatório do staging.

## Porque a instalação não toca na conta (análise de todas as instruções)

- **`auth.users`:** nenhum INSERT, UPDATE ou DELETE em `auth.*` em nenhum dos 4 SQL, nem dentro de funções. Das 78 instruções de dados no topo, nenhuma é em `auth`.
- **Gatilho novo em `auth.users`:** `AFTER INSERT`, por isso só corre para contas criadas depois. Não há gatilho de UPDATE: um início de sessão do proprietário não dispara nada.
- **`user_roles`:** o único preenchimento (S2-01:350) só dá `consultant` a contas **sem nenhum papel**. O proprietário tem `admin`, por isso fica de fora. O P04 exige que as contas sem papel sejam 0.
- **`profiles`:** não há preenchimento de contas existentes. Não é criado perfil para o proprietário, nem estado de acesso, nem categorias.
- **`has_staging_access`:** não é tocada, por isso o acesso à página `/staging` (admin ou tester) continua igual.

## Opção A (recomendada e verificada): sem perfil V2 para o proprietário

O proprietário continua a entrar no staging como hoje. Os testes da V2 usam contas sintéticas (passo S5). Nada a escrever.

## Opção B (NÃO autorizada): criar mais tarde um perfil V2 para o proprietário

Seria uma alteração de dados à parte, com autorização própria. Não recria identidade e não mexe em papéis.

Não está incluída neste pacote.

## Verificação

| Momento | Consulta | Tem de dar |
|---|---|---|
| imediatamente antes | P04 | 1 conta, email confirmado, não bloqueada/apagada/anónima, papéis `{admin}`, 1 admin, 0 contas sem papel. **Guardar** as duas impressões digitais |
| logo depois | Q03 | Os mesmos valores, papéis `{admin}`, `created_by` nulo, sem perfil, sem estado de acesso, sem categorias |

Para não se confundir com um início de sessão:
- a impressão "identidade" usa só id, email, data de confirmação e data de criação;
- a "alargada" é informativa e pode mudar com um início de sessão.

**Ensaio (conta sintética, base descartável):** P04 e Q03 deram as mesmas impressões (`0dae4b7c…` e `2ad057eb…`), papéis `{admin}`, 0 perfis, 0 categorias e 0 estados de acesso. Ver `evidence/`.

**Risco residual.** Se alguém retirar o papel `admin` entre o P04 e a instalação, o preenchimento daria `consultant`. Por isso o P04 corre imediatamente antes e o Q03 deteta a alteração. Se acontecer, **reportar e não corrigir à mão**.
