# AFONSO V2 · pacote de instalação auditável para o AFONSO Staging — v1.0.0

**Estado: só para auditoria.** Nada deste pacote foi executado no staging, na V1 ou em qualquer base gerida. G1–G4 continuam NO-GO.

| | |
|---|---|
| Destino único | Projeto **AFONSO Staging** (`8d741542-70d9-4078-bfc6-64e3d047396a`) |
| Nunca aplicar | ao projeto V1 (produção) nem a nenhum outro |
| Origem dos SQL | `staging-install/migrations/` no commit `71c09d03`. Cópia integral, byte a byte (ver `MANIFEST.json`) |
| Ensaio | Base PostgreSQL 17 descartável e isolada: aplicação sem erros, 8/8 + 3/3 (`../../rehearsal/README.md`) e pacote validado por `tools/validate-disposable.sh` (`evidence/`) |
| Integridade | `sha256sum -c SHA256SUMS` dentro desta pasta |

## Conteúdo

| Caminho | O quê |
|---|---|
| `sql/S2-00…S2-99` | Os 4 SQL de instalação, integrais |
| `preflight/P00…P04` | Consultas **só de leitura** a correr no staging **antes**: alvo, executor real, privilégios, colisões, conta do proprietário |
| `posflight/Q00…Q04` | Consultas **só de leitura** a correr **depois**: alvo, estrutura (impressões digitais esperadas), segurança, conta do proprietário, acesso do staging |
| `COLLISIONS.md` | Mapa de colisões com o staging atual |
| `OWNER-ACCOUNT.md` | Plano para manter a conta do proprietário exatamente igual |
| `EXECUTOR-PRIVILEGES.md` | Como comprovar sem escrever as permissões do papel real das migrações, e o bloqueio |
| `DEPENDENCIES.md` | Dependências de plataforma, extensões, ordem e tamanho |
| `MANIFEST.json`, `SHA256SUMS` | Inventário e hashes de todos os ficheiros |
| `tools/` | Validador para a base descartável e leitor de resultados (não são para o staging) |
| `evidence/` | Saídas do preflight e posflight na base descartável, só com conta sintética |

Cada consulta de `preflight/` e `posflight/` é um único `SELECT`/`WITH`:
- sem escrita, sem chamadas a funções da app e sem dados reais;
- o email do proprietário é `__EMAIL_AUTORIZADO__`, a substituir no momento;
- foram corridas com `default_transaction_read_only = on` na base descartável.

## Procedimento no staging

As **etapas 1–2 são o que se pede agora**. As etapas 3–6 ficam para quando houver autorização expressa, uma por etapa.

1. **Integridade.** Correr `sha256sum -c SHA256SUMS`. Tem de dar OK em todos os ficheiros.
2. **Preflight, só de leitura,** pela ferramenta de consultas de leitura do staging. Correr P00, P01, P02, P03 e P04, por esta ordem, e guardar as saídas integrais. **PARAR** se acontecer qualquer um destes casos:
   - alguma linha com `ok`/`esperado` = false (no P02, só as linhas com `obrigatorio = true`);
   - o P01 dá `AMBÍGUO` ou `NÃO VISÍVEL`.

   As impressões digitais do P04 ficam guardadas no relatório do staging.

   *Etapas futuras, cada uma com autorização própria:*
3. Voltar a correr o P04 imediatamente antes de instalar e confirmar que os valores não mudaram.
4. Aplicar `sql/` com a ferramenta de migrações **do staging**, um ficheiro por migração e pela ordem S2-00, S2-01, S2-02, S2-99. Copiar o conteúdo **byte a byte**. Se uma migração falhar: parar, reportar o erro e não editar o SQL à mão (uma correção gera nova versão do pacote).
5. **Posflight:** correr Q00–Q04. O Q01 tem de bater com as impressões esperadas e o Q03 com o P04.
6. Criar o bucket `assessor-files` (privado) com a ferramenta de armazenamento. Depois seguem-se S3–S8 do `staging-install/README.md`.

## O que enviar ao projeto staging para auditoria

A pasta `v1.0.0/` inteira, ou o ZIP equivalente, com:
- `sql/`, `preflight/`, `posflight/`;
- os 4 documentos `.md` e este README;
- `MANIFEST.json` e `SHA256SUMS`.

`tools/` e `evidence/` são opcionais (servem para reproduzir o ensaio).

Pedido ao staging:
- executar **só as etapas 1–2**;
- devolver a saída do `sha256sum -c` e as 5 saídas do preflight;
- **não** aplicar migrações;
- **não** alterar papéis, contas, segurança ou permissões.

## Bloqueios e riscos

| # | Bloqueio / risco | Estado |
|---|---|---|
| B1 | Permissão TRIGGER (e restantes requisitos) do papel **real** das migrações | **BLOQUEIO** até o P01 e o P02 correrem no staging. Mesmo com tudo verdadeiro, é evidência inferida, não prova definitiva (EXECUTOR-PRIVILEGES.md) |
| B2 | `BYPASSRLS` do executor (FORCE RLS em 8 tabelas). Sem isto, a criação de contas novas falharia depois da instalação | Verificado no P02. Bloqueio se false |
| B3 | Limite de tamanho do pedido da ferramenta de migrações (o S2-01 tem 190 KB) | Por confirmar. Se exceder, dividir o S2-01 e gerar a v1.0.1 |
| R1 | Objetos criados fora das migrações no staging (por exemplo um `profiles` ou um gatilho em `auth.users`) | O P00 e o P03 detetam; parar se aparecerem |
| R2 | Aplicação parcial (S2-00 aplicado, S2-01 falha) | Inofensivo e repetível (EXECUTOR-PRIVILEGES.md) |
| R3 | Contas novas no staging depois da instalação recebem automaticamente perfil, papel `consultant` e 6 categorias | Esperado na V2. O acesso ao staging continua a depender só de `admin`/`tester` |
| R4 | `has_role` passa a responder só sobre quem pergunta | O staging não usa `has_role`. `has_staging_access` fica inalterada (Q04) |
| R5 | As impressões de estrutura do Q01 vêm do ensaio com a plataforma simulada | Uma diferença obriga a investigar antes de prosseguir; não é necessariamente erro |
| R6 | O staging pode ter mudado depois do instantâneo `608dad98` | O P00 e o P03 voltam a verificar no momento |
