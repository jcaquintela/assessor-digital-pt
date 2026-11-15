# Executor das migrações — v1.0.4 (B2; unaccent com dicionário P1 e sem OID fixo P2)

## O que o SQL consegue e não consegue provar

- **P01** lê o **dono histórico** dos objetos que a migração 0000 do staging criou.
- **P02** lê, no catálogo, os privilégios **desse** papel — incluindo o caminho de `unaccent` (v1.0.3) e, desde a v1.0.4, o dicionário `extensions.unaccent` (P02-16) e os privilégios por omissão do superutilizador de arranque lido do catálogo (P02-14, sem supor o OID 10).
- Isto diz quem criou esses objetos **no passado**. **Não prova** que a ferramenta de migrações do staging vai usar esse papel nem que não há regras da plataforma por cima (ex.: lista de extensões permitidas). Veredito: "APROVADO SÓ COMO DONO HISTÓRICO".

## Evidência independente exigida (antes de qualquer aplicação)

1. Declaração/registo da plataforma do AFONSO Staging que identifique o papel usado pela ferramenta de migrações (nome, superutilizador, BYPASSRLS, dono de `public`, se pode criar extensões e se `unaccent` está permitida), **ou**
2. um ensaio autorizado com **a mesma ferramenta e o mesmo papel**, lido depois só de leitura com `pg_get_userbyid(relowner)` (F1: falso positivo, mantido).

| Item | Estado |
|---|---|
| Papel efetivo das migrações | **PENDENTE** — sem evidência independente |
| Esse papel = dono histórico (P01)? | **DESCONHECIDO** |
| BYPASSRLS / CREATE em `public` / REFERENCES em `auth.users` desse papel | **DESCONHECIDO** |
| Estado de `unaccent` no staging (INSTALADA / NOVA) | **DESCONHECIDO** até o P02 correr lá (B16) |
| Se NOVA: o executor efetivo pode `CREATE EXTENSION unaccent` em `extensions`? | **DESCONHECIDO** (P02-13 só cobre o dono histórico; a plataforma pode recusar) |
| Se INSTALADA: o executor efetivo tem EXECUTE em `extensions.unaccent(regdictionary, text)`? | **DESCONHECIDO** (P02-11 só cobre o dono histórico e `service_role`) |

Nenhum destes estados foi preenchido por suposição.

## O que a v1.0.4 precisa desse papel (igual à v1.0.3: as S4 não mudaram)

| Requisito | Porquê | Leitura do dono histórico |
|---|---|---|
| CREATE em `public` | criar tipos, tabelas, funções | P02-02 |
| USAGE em `auth` + EXECUTE em `auth.uid()` | barreira e políticas | P02-03 |
| REFERENCES em `auth.users` | só `profiles_id_fkey` | P02-04 |
| dono (ou membro) de `app_role` e dono de `user_roles` | `ADD VALUE`, `ADD COLUMN created_by` | P02-05, P02-01 |
| BYPASSRLS ou superutilizador | 8 tabelas com FORCE RLS escritas por funções SECURITY DEFINER do dono | P02-06 |
| `unaccent` | o S4-00 faz `CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions`; o S4-01 cria `public.text_norm`, que chama `extensions.unaccent('extensions.unaccent', …)` | **P02-07** (estado), INSTALADA: **P02-10** (assinaturas, membro da extensão, dicionário), **P02-11** (EXECUTE), **P02-16** (dicionário: membro da extensão, modelo `extensions.unaccent` com init/lexize da extensão, opções `RULES = 'unaccent'`, dono = dono das funções e da extensão ou o superutilizador de arranque); NOVA: **P02-12** (sem objetos soltos), **P02-13** (superutilizador, ou trusted + CREATE na base + CREATE em `extensions`), **P02-14** (privilégios por omissão do dono histórico e do superutilizador de arranque, lido como dono de `pg_catalog`); ambos: **P02-15** (USAGE em `extensions`), P02-08 (`service_role`) |
| poder revogar privilégios a `service_role` nos objetos que cria | ACL normalizada | (é dono: sempre pode) |

P02-13 é **conservador**: exige CREATE na base **e** em `extensions` (ou superutilizador). Pode recusar um caminho que a plataforma permitiria (falso negativo); nunca aprova um caminho sem esses privilégios.

P02-16 compara as opções do dicionário com as do script da extensão (`RULES = 'unaccent'`, normalizadas sem espaços e em minúsculas). Se uma versão da extensão gravar as opções de outra forma, o P02 reprova: é um falso negativo possível, nunca uma aprovação.

Nada nesta versão foi lido no staging: todos os estados acima continuam **PENDENTE/DESCONHECIDO**.
