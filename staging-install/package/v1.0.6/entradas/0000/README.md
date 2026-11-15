# Entrada 0000 do staging — AUTENTICADA (input histórico, bytes originais conferidos)

**Estado: AUTENTICADO.** A migração 0000 do AFONSO Staging cria `app_role`, `user_roles`, `staging_notes` (3 notas), `has_role` e `has_staging_access`. O ficheiro original está nesta pasta, **byte a byte**: `0000_staging_access_control.sql`. Nada foi executado com ele.

## Origem dos bytes

- Leitura **só de leitura** entre projetos, autorizada pelo proprietário, apenas deste caminho: `drizzle/migrations/0000_staging_access_control.sql`.
- A ferramenta devolve o código mais recente do AFONSO Staging (snapshot `608dad98`) e **não permite escolher** o commit `ab518782…`. A ligação dos bytes a esse commit assenta no **blob Git** e no **sha256** que o proprietário declarou para ele, ambos conferidos abaixo.
- O texto devolvido pelo conector de leitura do proprietário **não** foi usado como fonte; nada foi reconstruído a partir de texto.

## Conferência feita antes de marcar AUTENTICADO (estática, sobre os bytes)

| Campo | Registado | Obtido |
|---|---|---|
| SHA256 integral | `a87578e560f0c97f9c1184d5fe3e2730f18de6e513b8e610c4808a28f98aecd2` | igual |
| Blob Git | `24c38a525e549551e1fdf3028ff58e1e1906b0ee` | igual |
| Tamanho | 2303 bytes | igual |
| Linhas | 44 | igual (43 LF) |
| LF final | não | não (último byte `;`) |
| Commit declarado | `ab5187829bb989795d47a283e0f093b796843e72` | não selecionável; ver "Origem" |

Além disso, os md5 calculados dos bytes coincidem com as constantes que o P03/Q04 já usavam: corpo de `has_role` `6b9bca1c…`, corpo de `has_staging_access` `4376edee…`, 3 notas `9839c856…`. Detalhe em `evidence/entrada-0000-check.txt`.

**Ressalva obrigatória:** input histórico do repositório do staging; **correspondência com a base de dados real do staging NÃO verificada**; **contém 3 INSERTs sintéticos** (as 3 notas de `staging_notes`, numa única instrução `INSERT` com 3 linhas). Por isso o B14 continua aberto.

## Como é usada no ensaio (nunca executado)

- O `ESPERADO` regista `estado=AUTENTICADO` e `ficheiro_no_pacote`.
- O **R05** só aceita o ficheiro entregue se:
  - a cópia do pacote estiver no `SHA256SUMS` com o sha256 registado e conferir no disco;
  - o ficheiro entregue tiver esse sha256, o tamanho, as linhas, a ausência de LF final e o blob Git registados.
- O R05 copia-o para `evidencia/entradas/0000.sql`; o **R40** reconfere esse sha256 antes do passo `0000`.
- Uma segunda chamada ao R05 na mesma instância é recusada; nada se substitui.

## O que esta entrada não faz

- Não prova que a base de dados real do staging tem este estado.
- Não transforma o ensaio sintético numa prova da 0000 real.
- Mudar o ficheiro ou o `ESPERADO` exige uma nova versão do pacote e nova auditoria.
