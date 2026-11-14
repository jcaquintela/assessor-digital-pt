# Conta do proprietário no staging — v1.0.1

**Objetivo:** a conta autorizada (email confirmado, papel `admin`) fica **exatamente** igual. Sem identidade recriada, sem perfil, sem conta nova, sem papel novo.

O email **não** está neste pacote: P04 e Q03 usam `__EMAIL_AUTORIZADO__`, substituído pelo operador ao executar.

## Porque a instalação não pode tocar na conta

- Nenhuma instrução de dados em nenhuma migração (verificado pelo parser oficial do PostgreSQL).
- Nenhum gatilho em `auth.users` (o da V2 está em quarentena, QZ-02).
- Nenhum preenchimento de papéis (a v1.0.0 dava `consultant` a contas sem papel; foi para a quarentena).
- `user_roles` só ganha a coluna nula `created_by`; a linha `admin` fica com `created_by` nulo.
- `has_staging_access` e `has_role` não são tocadas: o acesso à página do staging continua igual.

## O admin do staging não é admin V2

Fica assim de propósito. Dar poderes V2 (`super_admin`) ao admin do staging, ou criar-lhe perfil V2, é uma alteração de privilégios/dados que exige autorização própria (BLOCKERS.md, B4/B5). Não está neste pacote.

## Verificação (automática)

| Momento | Consulta | O que faz |
|---|---|---|
| imediatamente antes | P04 | 1 conta, confirmada, não bloqueada/apagada/anónima, papéis `{admin}`, 1 admin, sem `profiles`. Devolve 4 valores a GUARDAR (P04-09…12) |
| logo depois | Q03 | Recebe esses 4 valores nos marcadores `__…_P04__` e compara-os **na própria consulta**; exige ainda 0 perfis no total, sem estado de acesso nem categorias, e o mesmo número de contas. Qualquer diferença => erro `REPROVADO` |

Se o Q03 reprovar: **parar e reportar; não corrigir à mão**.
