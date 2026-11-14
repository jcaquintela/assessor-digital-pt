"""Lê a saída das consultas (psql -A -F ' | ') e lista as verificações falhadas.
Coluna de resultado: 'ok' ou 'esperado'. Com coluna 'obrigatorio', só contam as obrigatórias."""
import sys
bad, blocks = [], 0
for path in sys.argv[1:]:
    name, header = None, None
    for line in open(path, encoding="utf-8"):
        line = line.rstrip("\n")
        if line.startswith("##### "):
            name, header = line[6:], None; blocks += 1; continue
        if not line or line.startswith("(") and line.endswith(")"):
            continue
        cols = line.split(" | ")
        if header is None:
            header = cols; continue
        if len(cols) != len(header):
            continue
        row = dict(zip(header, cols))
        res = row.get("ok", row.get("esperado"))
        if res is None:
            continue
        if "obrigatorio" in row and row["obrigatorio"] != "t":
            continue
        if res != "t":
            bad.append(f"{name}: {cols[0]} -> {res}")
print(f"{blocks} consultas lidas; {len(bad)} verificações falhadas")
for b in bad: print("  FALHOU", b)
sys.exit(1 if bad else 0)
