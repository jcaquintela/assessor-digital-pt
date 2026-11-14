# Critérios de teste — v1.0.3

## Já verificado (estático, sem base de dados, sem executar nenhum script do ensaio)

| Verificação | Onde | Critério |
|---|---|---|
| Migrações preservadas | `src/lib/staging/v103/package-v103.test.ts` | S4-00…S4-05 com os 6 sha256 da v1.0.2 e iguais byte a byte aos ficheiros da v1.0.2 |
| Só o P02 muda | idem + `DIFF-v1.0.2.md` | Todas as outras P/Q, quarentena e `ACCESS-MATRIX.md` iguais à v1.0.2; F1 intacto |
| R4 | idem | P02-07 substituída; P02-10…15 novas; condicionais INSTALADA/NOVA; veredito "só como dono histórico" |
| R30 | idem + parser | 1 SELECT; marcadores `__R_…__` só por substituir; falha com erro |
| Bootstrap e T01 | idem + parser | 1.ª instrução = guarda `BLOQUEADO`, 2.ª = guarda `SÓ DESCARTÁVEL`; só `@afonso-staging.invalid`; sem palavras-passe nem tokens; corpo T01 = v1.0.2 |
| Scripts R* | idem + `sh -n`/`bash -n` | exigem `AUTORIZADO:<ref>`; não imprimem valores de ambiente; não usam rede, `pg_ctl`, `PGPASSWORD`, `.pgpass`; só o R40 abre uma ligação, pelo socket da pasta do ensaio |
| Sintaxe | `evidence/parse-check.txt` | Parser oficial do PostgreSQL 17 (libpg-query 17.8.3): 0 falhas |
| Integridade | idem | `SHA256SUMS` cobre todos os ficheiros e confere; `MANIFEST.json` com os mesmos hashes; v1.0.0, v1.0.1 e v1.0.2 continuam byte a byte iguais |
| Sem dados reais | idem | 0 emails reais, telefones, UUIDs, endereços ou referências de produção nos ficheiros novos |

## NÃO incluído (dito explicitamente)

- **Nenhum teste com base de dados** (nem descartável): aplicação das S4, P/Q, T01, bootstrap.
- **Nenhum script do ensaio executado**: R10, R20, R40, R41, R90 só verificados por sintaxe. O comportamento real em `/proc` não foi observado.
- **Shellcheck** não disponível neste ambiente: só `sh -n` e `bash -n`.
- **Isolamento**: nenhuma prova; os scripts sozinhos **não** o provam (E1–E9 são do operador).
- **Executor real do staging**, leitura de `auth.identities` no staging, estado de `unaccent` no staging: nada lido.
- **Autenticidade da 0000 do staging**: não verificável (só prefixo sha256, B14).
- APIs de servidor, Storage, Realtime, GoTrue: não existem / não cobertos.

## Limites das impressões (P05 → Q03/Q04)

- Cobrem **só** o que está listado: campos estáveis de `auth.users` da conta, `auth.identities` da conta, linhas de `user_roles`, políticas de `staging_notes`/`user_roles`, atributos de `has_role`/`has_staging_access`, ACL/RLS dessas duas tabelas, dono/ACL de `app_role`. **Não cobrem** outras tabelas de `auth`, `storage`, papéis e os seus atributos, privilégios em `auth.*`, extensões, gatilhos de evento nem configuração do servidor.
- São sha256 de **texto deparsado** pelo servidor: dependem do `search_path` e da versão. P05 e Q03/Q04 têm de correr na **mesma ferramenta/sessão-tipo**; uma diferença dá REPROVADO (falso negativo possível), nunca falso APROVADO.
- Detetam **mudança**, não correção: uma impressão igual prova que o objeto não mudou desde o P05, não que estava certo antes.
- `md5` só contra **constantes** (corpos da 0000 e as 3 notas): se a 0000 usada no ensaio não for a autêntica, o P03/Q04 reprova (B14).
- Sem permissão de leitura em `auth.identities`, P04/P05/Q03 dão erro: BLOQUEIO (B11).

## Por verificar (exige autorização separada; nenhuma dada)

Ver `REHEARSAL-PLAN.md`: E1–E9 → R10/R20/R40 → bootstrap → P00–P05 → S4 → Q00–Q05 → T01 (separado) → R90. Critério: cada fase aprovada; qualquer erro ⇒ abortar e descartar.
