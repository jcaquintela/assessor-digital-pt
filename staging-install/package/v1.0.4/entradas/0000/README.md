# Entrada 0000 do staging — interface (B14: PENDENTE, bytes não obtidos)

**Estado: PENDENTE — metadados registados, bytes originais NÃO obtidos.** A migração 0000 do AFONSO Staging cria `app_role`, `user_roles`, `staging_notes` (3 notas), `has_role` e `has_staging_access`. O P03/Q04 comparam o corpo de `has_role` e as notas com constantes; só o ficheiro autêntico passa. **Este pacote não contém o ficheiro e não o reconstruiu a partir de texto.**

## Metadados localizados (registados em `ESPERADO`)

Localizados pelo proprietário **no código do AFONSO Staging** e comunicados nesta versão. Não foram conferidos aqui contra bytes, porque os bytes não estão disponíveis neste repositório.

| Campo | Valor |
|---|---|
| Ficheiro | `drizzle/migrations/0000_staging_access_control.sql` |
| Commit | `ab5187829bb989795d47a283e0f093b796843e72` |
| Blob Git | `24c38a525e549551e1fdf3028ff58e1e1906b0ee` |
| SHA256 integral | `a87578e560f0c97f9c1184d5fe3e2730f18de6e513b8e610c4808a28f98aecd2` (começa pelo prefixo conhecido `a87578e560f0c97f`) |
| Tamanho | 2303 bytes |
| Linhas | 44, **sem LF final** |
| Referência anterior | snapshot `608dad98` citado nas versões anteriores; não confirmado como origem destes bytes |

**Pedido em aberto:** transferência **autorizada** do ficheiro original, byte a byte, a partir do repositório do staging (ex.: o ficheiro anexado tal como está no commit acima). Sem essa transferência a entrada fica PENDENTE.

**Ressalva obrigatória quando for incorporado:** input histórico do repositório do staging; **correspondência com a base de dados real do staging NÃO verificada**; **contém 3 INSERTs sintéticos** (as 3 notas de `staging_notes`).

## Como a entrada fica aceite (dois caminhos, ambos exigem uma NOVA versão do pacote)

| Caminho | O que é preciso | Onde fica registado |
|---|---|---|
| **A. Ficheiro histórico autenticado** | Receber o ficheiro original por transferência autorizada do repositório do staging (commit `ab518782…`), conferir sha256 integral, blob Git, 2303 bytes, 44 linhas e ausência de LF final contra os metadados acima, e só então incluí-lo como input histórico auditado, com a ressalva | `ESPERADO`: `estado=AUTENTICADO` (os restantes campos já registados); hash também no `MANIFEST.json` |
| **B. Bootstrap alternativo** | Só se A for impossível: um ficheiro novo que reproduza a 0000, escrito e **auditado separadamente** (incluindo o efeito nas constantes do P03/Q04) | `ESPERADO`: `estado=ALTERNATIVO_AUDITADO`, `alternativo_sha256=<64 hex>`, `auditoria=<referência>` |

Em qualquer outro estado:

- o **R10 recusa arrancar** a instância, porque o ensaio não podia terminar;
- o **R05 recusa** o ficheiro;
- o passo `0000` do **R40** não tem entrada.

O R05 copia o ficheiro aceite para `evidencia/entradas/0000.sql`, confere sha256 e, no caminho A, também tamanho, linhas, LF final e blob Git, e regista o sha256. O R40 reconfere esse sha256 antes de ligar.

## O que esta interface não faz

- Não descarrega nada nem lê o repositório do staging.
- Não aceita um ficheiro só por o prefixo coincidir.
- Não aceita texto copiado do chat como substituto dos bytes originais.
- Não deixa substituir a entrada depois de preparada: uma segunda chamada ao R05 é recusada.
- Não transforma o ensaio sintético numa prova da 0000 real: a autenticidade vem só do registo auditado.
