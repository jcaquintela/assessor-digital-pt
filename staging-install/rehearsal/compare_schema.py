import re, sys, collections
types_path, C = sys.argv[1], sys.argv[2] + "/"
pub = open(types_path).read(); pub = pub[pub.index("  public: {"):]
def block(name):
    m = re.search(r"\n    " + name + r": \{\n", pub)
    if not m: return ""
    return pub[m.end():pub.index("\n    }", m.end())]
tables = {m.group(1): {mm.group(1): mm.group(2) for mm in re.finditer(r"\n\s+([a-z0-9_]+): (.*)", "\n" + m.group(2))}
          for m in re.finditer(r"\n      ([a-z0-9_]+): \{\n        Row: \{\n(.*?)\n        \}", "\n" + block("Tables"), re.S)}
funcs = set(re.findall(r"\n      ([a-z0-9_]+):", "\n" + block("Functions")))
enums = {m.group(1): re.findall(r'"([^"]+)"', m.group(2)) for m in re.finditer(r"\n      ([a-z0-9_]+):((?:\n?\s*\|?\s*\"[^\"]+\")+)", "\n" + block("Enums"))}
db = collections.defaultdict(dict)
for l in open(C + "db_columns.tsv"):
    t, c, ty, n = l.rstrip("\n").split("\t"); db[t][c] = n == "YES"
dbf = set(open(C + "db_functions.txt").read().split())
dbe = collections.defaultdict(list)
for l in open(C + "db_enums.tsv"):
    a, b = l.rstrip("\n").split("\t"); dbe[a].append(b)
out = []
out.append(f"types.ts: {len(tables)} tabelas, {len(funcs)} funções, {len(enums)} enums | descartável: {len(db)} tabelas, {len(dbf)} funções, {len(dbe)} enums")
out.append(f"tabelas em falta na descartável: {sorted(set(tables) - set(db))}")
out.append(f"tabelas a mais na descartável: {sorted(set(db) - set(tables))}")
miss = {t: sorted(set(tables[t]) - set(db[t])) for t in tables if t in db and set(tables[t]) - set(db[t])}
extra = {t: sorted(set(db[t]) - set(tables[t])) for t in tables if t in db and set(db[t]) - set(tables[t])}
out.append(f"colunas em falta: {miss}"); out.append(f"colunas a mais: {extra}")
nd = [f"{t}.{c}" for t in tables if t in db for c, ty in tables[t].items() if c in db[t] and ("| null" in ty) != db[t][c]]
out.append(f"diferenças de nulabilidade: {nd}")
out.append(f"funções de types.ts em falta: {sorted(funcs - dbf)}")
rpcs = set(open(C + "code_rpcs.txt").read().split()); frm = set(open(C + "code_from.txt").read().split())
out.append(f"código: {len(rpcs)} funções chamadas, em falta: {sorted(rpcs - dbf)}")
out.append(f"código: {len(frm)} tabelas usadas, em falta: {sorted(frm - set(db))}")
for e, v in enums.items():
    if dbe.get(e) != v: out.append(f"enum diferente {e}: types.ts={v} descartável={dbe.get(e)}")
out.append(f"enums a mais: {sorted(set(dbe) - set(enums))}")
print("\n".join(out))
