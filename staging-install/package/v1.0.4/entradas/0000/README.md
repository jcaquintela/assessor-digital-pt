# Entrada 0000 do staging — interface (B14: PENDENTE)

**Estado: PENDENTE. Nada foi inventado nem substituído.** A migração 0000 do AFONSO Staging (`drizzle/migrations/0000_staging_access_control.sql`, snapshot `608dad98`) cria `app_role`, `user_roles`, `staging_notes` (3 notas), `has_role` e `has_staging_access`. O P03/Q04 comparam o corpo de `has_role` e as notas com constantes; só o ficheiro autêntico passa. Deste ficheiro conhece-se **apenas o prefixo sha256 `a87578e560f0c97f`**. Este pacote **não** o contém.

## Como a entrada fica aceite (dois caminhos, ambos exigem uma NOVA versão do pacote)

| Caminho | O que é preciso | Onde fica registado |
|---|---|---|
| **A. Ficheiro histórico autenticado** | Ler o ficheiro no repositório do staging (só leitura) por um caminho auditável (ex.: commit `608dad98` com o histórico do repositório), calcular o sha256 **integral**, confirmar que começa por `a87578e560f0c97f` e registar a origem | `ESPERADO`: `estado=AUTENTICADO`, `sha256=<64 hex>` |
| **B. Bootstrap alternativo** | Só se A for impossível: um ficheiro novo que reproduza a 0000, escrito e **auditado separadamente** (incluindo o efeito nas constantes do P03/Q04) | `ESPERADO`: `estado=ALTERNATIVO_AUDITADO`, `alternativo_sha256=<64 hex>`, `auditoria=<referência>` |

Em qualquer outro estado:

- o **R10 recusa arrancar** a instância, porque o ensaio não podia terminar;
- o **R05 recusa** o ficheiro;
- o passo `0000` do **R40** não tem entrada.

O R05 copia o ficheiro aceite para `evidencia/entradas/0000.sql` e regista o sha256. O R40 reconfere esse sha256 antes de ligar.

## O que esta interface não faz

- Não descarrega nada nem lê o repositório do staging.
- Não aceita um ficheiro só por o prefixo coincidir.
- Não deixa substituir a entrada depois de preparada: uma segunda chamada ao R05 é recusada.
- Não transforma o ensaio sintético numa prova da 0000 real: a autenticidade vem só do registo auditado.
