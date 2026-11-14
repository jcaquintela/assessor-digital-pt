# Bibliotecas externas: vulnerabilidades conhecidas (14/11/2026)

Fonte: `bun audit` (bun 1.4.4) sobre o `bun.lock` atual. Só leitura: **não atualizei nenhuma biblioteca.**
Total: 114 avisos em 27 pacotes — 2 críticos, 43 altos, 57 moderados, 12 baixos.

## Críticos

| Pacote | Vem de | Corre em produção? | Nota |
|---|---|---|---|
| `proxy-addr` 2.0.7 | `express` → `@modelcontextprotocol/sdk` 1.28.0 → `@lovable.dev/mcp-js` 0.24.0 | Sim, nas rotas MCP (`src/routes/mcp.ts`, `src/routes/[.mcp]/…`) | Falsificação de IP por sub-rede de confiança. O MCP não usa `trust proxy`; mesmo assim não ativar o MCP no staging até a biblioteca ser atualizada |
| `shell-quote` 1.9.0 | `launch-editor` → `@tanstack/devtools-vite` → `@lovable.dev/vite-tanstack-config` | Não (só ferramentas de desenvolvimento) | Sem efeito na app publicada |

## Altos (resumo)

- **Em runtime, via `@lovable.dev/mcp-js`:** `@modelcontextprotocol/sdk` (4 avisos), `body-parser`, `fast-uri` (6), `ip-address`, `hono`/`@hono/node-server`, `qs`. Correção: subir `@lovable.dev/mcp-js` quando houver versão com SDK ≥ 1.32.0. A versão do SDK está fixa pela biblioteca (`requires 1.28.0`), por isso não há correção segura só do nosso lado.
- **Só desenvolvimento, build ou testes:** `vite`/`launch-editor`, `postcss`, `nanoid`, `browserslist`, `source-map-js`, `js-yaml`, `brace-expansion`, `minimatch`, `glob`, `undici` (via `jsdom`), `vitest`, `esbuild`, `serialize-javascript`. Não entram no código que corre para o consultor.

## Recomendações (cada uma exige autorização)

1. Atualizar `@lovable.dev/mcp-js` assim que exista uma versão com o SDK corrigido. Depois: testes de MCP e `test:pilot`.
2. Atualizar `vite`, `vitest` e `jsdom` numa alteração separada, só de ferramentas, com a suite completa.
3. No staging, manter o MCP desligado até ao passo 1.

Não fiz nenhum `bun update` nem `bun audit --fix`.
