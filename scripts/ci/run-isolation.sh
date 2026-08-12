#!/usr/bin/env bash
# Corre o teste de isolamento e distingue falhas transitórias de falhas reais.
#
# Saídas:
#   0  -> tudo passou
#   75 -> falha transitória (5xx / 429 / rede) -> o CI pode repetir o job
#   1  -> falha determinística (isolamento realmente quebrado) -> NÃO repetir
set -uo pipefail

LOG="$(mktemp)"
bun run test:isolation 2>&1 | tee "$LOG"
status=${PIPESTATUS[0]}

if [ "$status" -eq 0 ]; then
  exit 0
fi

# Sinais inequívocos de falha de isolamento: nunca devem ser repetidos.
if grep -Eiq 'AssertionError|expected .* to (be|have)|Isolation' "$LOG" \
   && ! grep -Eiq 'Unexpected HTTP response: (50[0-9]|429)' "$LOG"; then
  echo "::error::Falha determinística de isolamento — sem re-run automático."
  exit 1
fi

TRANSIENT='\b(50[0-4]|429)\b|unexpected http response|fetch failed|network|ETIMEDOUT|timeout|ECONNRESET|ECONNREFUSED|EAI_AGAIN|socket hang up|serviço remoto indisponível'
if grep -Eiq "$TRANSIENT" "$LOG"; then
  echo "::warning::Falha transitória do serviço remoto (5xx/429/rede) — elegível para re-run."
  exit 75
fi

echo "::error::Falha não transitória — sem re-run automático."
exit 1
