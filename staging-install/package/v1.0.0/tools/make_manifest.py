"""Gera MANIFEST.json e SHA256SUMS deste pacote (determinístico, sem datas do sistema).
Uso: python3 tools/make_manifest.py   (a partir de qualquer pasta)"""
import hashlib, json, os
PKG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.normpath(os.path.join(PKG, "..", "..", "migrations"))
def sha(p): return hashlib.sha256(open(p, "rb").read()).hexdigest()
files = []
for root, _, names in os.walk(PKG):
    for n in names:
        rel = os.path.relpath(os.path.join(root, n), PKG).replace(os.sep, "/")
        if rel in ("SHA256SUMS", "MANIFEST.json") or "__pycache__" in rel: continue
        files.append(rel)
files.sort()
statements = {"S2-00_staging_roles_prelude.sql": 5, "S2-01_v2_schema_part1.sql": 918,
              "S2-02_v2_schema_part2.sql": 342, "S2-99_staging_safety_checks.sql": 2}
sql = []
for i, name in enumerate(statements):
    p = os.path.join(PKG, "sql", name)
    src = os.path.join(SRC, name)
    sql.append({"order": i + 1, "file": f"sql/{name}", "sha256": sha(p), "bytes": os.path.getsize(p),
                "statements": statements[name], "one_migration_per_file": True,
                "identical_to_source": os.path.exists(src) and sha(src) == sha(p)})
manifest = {
  "package": "afonso-v2-staging-install", "version": "1.0.0", "prepared_on": "2026-11-14",
  "status": "AUDIT_ONLY - nada executado; G1-G4 NO-GO",
  "target_project": {"name": "AFONSO Staging", "id": "8d741542-70d9-4078-bfc6-64e3d047396a"},
  "never_apply_to": [{"name": "Consultor Assistente (V1, produção)", "id": "bf908ebc-1146-4c4f-a804-92bbc45c4e1a"}],
  "source": {"repo_path": "staging-install/migrations/", "commit": "71c09d03",
             "builder": "scripts/staging/build-staging-schema.ts", "rules": "src/lib/staging/schema-rules.ts"},
  "staging_baseline": {"migration": "drizzle/migrations/0000_staging_access_control.sql", "snapshot_commit": "608dad98",
                       "sha256_prefix": "a87578e560f0c97f"},
  "sql": sql,
  "read_only_checks": {"preflight": [f for f in files if f.startswith("preflight/")],
                       "posflight": [f for f in files if f.startswith("posflight/")],
                       "placeholder": "__EMAIL_AUTORIZADO__"},
  "expected": {"has_role_body_md5_before": "6b9bca1cc09de70841cac113efbdd41a",
               "has_role_body_md5_after": "f12f7a59372b1f9e4bb5221649147a2e",
               "has_staging_access_body_md5": "4376edeea92abf14230207df0fbbef11",
               "handle_new_user_body_md5": "a7af893457d61aa06775f46ba8ab7a6a",
               "staging_notes_md5": "9839c85692f965b4f419fb33c6af3404",
               "public_tables_after": 106},
  "blockers": ["B1 permissão TRIGGER/privilégios do executor real: por comprovar (P01+P02 no staging)",
               "B2 BYPASSRLS do executor: por comprovar (P02)",
               "B3 limite de tamanho do pedido da ferramenta de migrações: por confirmar"],
  "files": [{"path": f, "sha256": sha(os.path.join(PKG, f)), "bytes": os.path.getsize(os.path.join(PKG, f))} for f in files],
}
open(os.path.join(PKG, "MANIFEST.json"), "w").write(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
with open(os.path.join(PKG, "SHA256SUMS"), "w") as out:
    for f in files + ["MANIFEST.json"]:
        out.write(f"{sha(os.path.join(PKG, f))}  {f}\n")
print(f"{len(files) + 1} ficheiros em SHA256SUMS; SQL idênticos à origem: {all(s['identical_to_source'] for s in sql)}")
