# Ensaio do esquema V2 numa base PostgreSQL 17 descartável — 14/11/2026

**Resultado:** S2-00, S2-01, S2-02 e S2-99 aplicam-se sem erros numa base nova, por esta ordem e um ficheiro por transação. Repetido duas vezes do zero, com o mesmo resultado.

**Limites do ensaio:**
- Isto **não** é o staging.
- Nada foi aplicado à produção (V1) nem à base principal do AFONSO Staging.
- Não houve dados reais, segredos, tarefas agendadas, webhooks, mensagens, integrações, interruptores nem pagamentos.

## 1. Instância usada e prova de isolamento (verificada antes de executar)

| | |
|---|---|
| Motor | PostgreSQL 17.11, binário oficial do nixpkgs, instalado em `/tmp/pg17` |
| Dados | `/tmp/afonso-disposable-pg/data`, criado de raiz com `initdb` neste ensaio |
| Identificador | `system_identifier = 7708101453725167784` (o executor aborta se for outro) |
| Ligação | só pelo socket local `/tmp/afonso-disposable-pg/sock`, porta 54329, base `afonso_disposable`; `listen_addresses = ''` (sem TCP) e `pg_hba` só `local` |
| Rede | o servidor corre num namespace de rede próprio (`unshare -n`): sem interfaces, sem rotas e sem DNS (`curl` → *Could not resolve host*). O cliente `psql` corre igualmente sem rede |
| Credenciais | cliente lançado com `env -i`: a única variável visível é `PATH`. As variáveis de ligação da sandbox à base gerida (`PG*`, `SUPABASE_*`) **não** chegam ao cliente |
| Processo | utilizador sem privilégios (`nobody`) |
| Extensões | só `plpgsql` no início. `dblink`/`postgres_fdw` existem no pacote mas nunca foram instaladas, e sem rede seriam inúteis |

Prova completa: `results/isolation-proof.txt`.

## 2. SQL aplicado e resultado por etapa

Correr com `STAGING_0000=<…>/0000_staging_access_control.sql ./run-rehearsal.sh 7708101453725167784`.

| Etapa | Ficheiro (sha256, 16 primeiros caracteres) | Resultado |
|---|---|---|
| E0 | `00_supabase_shim.sql` (`04b11d62cd786812`): simulação mínima da plataforma | OK. 1 aviso: publicação Realtime sem `wal_level=logical`, esperado aqui |
| E1 | `0000_staging_access_control.sql` do staging (`a87578e560f0c97f`): estado atual do staging, lido do repositório | OK |
| E2 | `S2-00_staging_roles_prelude.sql` (`4e089b4712a43107`) | OK |
| E3 | `S2-01_v2_schema_part1.sql` (`d9bf6c0e3adfd8ad`), 918 instruções | OK, 0,23 s. 34 avisos "já existe / não existe, a saltar", todos de `IF [NOT] EXISTS` |
| E4 | `S2-02_v2_schema_part2.sql` (`d553e0d4280519bb`), 342 instruções | OK, 0,08 s. 12 avisos do mesmo tipo |
| E5 | `S2-99_staging_safety_checks.sql` (`fdea9a5cd564ae51`) | OK |
| E6 | `10_synthetic_smoke.sql`: dados sintéticos, termina em ROLLBACK | 8/8 verificações |
| E7 | `20_safety_checks_negative.sql`: em ROLLBACK | 3/3 casos com o resultado esperado |

Os avisos de E3/E4 estão em `results/*.notices.txt`. Um deles é esperado e confirma a preservação: `user_roles` "já existe, a saltar". A tabela do staging fica com a mesma estrutura da V2 (chaves, unicidade, `created_by`, 5 políticas).

**E6 — o que foi exercitado** (3 contas sintéticas `@afonso-staging.invalid`):
- **T1:** o registo cria o perfil (gatilho de `auth.users`).
- **T2:** o consultor A vê só os seus dados e não escreve em nome de B; não é admin nem lê as notas do staging.
- **T3:** B não vê nem altera dados de A, e não vê outros perfis.
- **T4:** o `tester` do staging continua a ter acesso ao staging e **não** ganha poderes de admin V2.
- **T5:** o anónimo não lê pessoas nem executa verificações de papéis.
- **T6:**
  - a mensagem recebida é reclamada uma única vez;
  - o teto de 1 aviso por dia funciona;
  - o lock da conversa é exclusivo;
  - o plano efetivo é `base`.
- **T7a:** sem piloto, não se emite convite (`no_pilot`).
- **T7b:** a escrita direta de participante é recusada pelo gatilho de guarda.

Depois do ROLLBACK, a base fica com 0 utilizadores, 0 pessoas e 0 papéis.

**E7:**
- **N1:** um interruptor ligado é desligado pelo S2-99.
- **N2:** uma ativação individual faz abortar a instalação.
- **N3:** um administrador V2 faz abortar a instalação.

## 3. Esquema criado vs. dependências da V2

`compare-with-app.sh` compara com `src/integrations/supabase/types.ts` (a descrição gerada do esquema atual) e com as chamadas da app ao esquema. Resultado completo em `results/comparison.txt`.

| Verificação | Resultado |
|---|---|
| Tabelas | 106 criadas: as 105 esperadas + `staging_notes` (do staging, esperada) |
| Colunas e nulabilidade, em todas as tabelas | 0 em falta, 0 a mais, 0 diferenças |
| Funções expostas (`types.ts`) | 21/21 presentes (43 no total, incluindo as de gatilhos) |
| Código: `.rpc()` | 15/15 presentes |
| Código: `.from()` | 100/100 presentes |
| Referências dentro das funções | nenhuma tabela ou função inexistente |
| Enums | 8/8. Única diferença: `app_role` tem também `admin` e `tester`, por desenho (S2-00) |
| RLS | ligado nas 106 tabelas; 126 políticas em `public` e 4 em `storage` |
| Interruptores | 13 criados, 0 ligados; 0 ativações individuais, 0 pilotos, 0 participantes, 0 papéis |

O esquema completo fica em `results/schema_public.sql` (`pg_dump --schema-only`, sem dados).

## 4. Objetos em falta e diferenças em relação ao staging real

**Nada falta para a app.** As diferenças vêm do ambiente simulado e são o que ainda está por provar:

1. **Plataforma simulada:** `auth`, `storage`, os papéis (`anon`, `authenticated`, `service_role`) e a publicação Realtime são uma simulação mínima (`00_supabase_shim.sql`). Sem serviço de autenticação, sem API de ficheiros e sem servidor Realtime.
2. **Privilégios:** aqui o executor é superutilizador. No staging, o utilizador das migrações tem menos privilégios. Os gatilhos em `auth.users` e as políticas em `storage.objects` já funcionam assim na produção, mas só o staging o prova.
3. **Bucket:** o bucket `assessor-files` não é criado pelo SQL; cria-se com a ferramenta de armazenamento (passo 4 do README principal).
4. **Extensões:** `unaccent`, `pgcrypto` e `uuid-ossp` foram instaladas em `extensions`, como no staging. Confirmar no staging que `unaccent` está disponível.
5. **Fora da comparação:** índices, texto das políticas, gatilhos, valores por omissão e verificações não foram comparados com a produção. Isso exige uma leitura só de catálogo da produção, não autorizada aqui.

## 5. Correções propostas

Nenhuma correção ao SQL é necessária: zero erros e zero dependências em falta.

Propostas para o passo real, cada uma sujeita a autorização:
- aplicar `S2-00 → S2-99` no staging pela ferramenta de migrações do próprio staging, um ficheiro por migração;
- repetir lá o E6 e o E7, adaptando a autenticação aos utilizadores sintéticos reais do staging;
- opcional: uma comparação só de leitura do catálogo de produção (índices, políticas, gatilhos) contra `results/schema_public.sql`.

## 6. Próximo passo

Autorização para aplicar no **AFONSO Staging** (passo S2 do README principal). Antes disso:
- credenciais de teste próprias no staging (S1);
- confirmar que o utilizador das migrações do staging pode criar gatilhos em `auth.users`.

Os gates G1–G4 continuam NO-GO.
