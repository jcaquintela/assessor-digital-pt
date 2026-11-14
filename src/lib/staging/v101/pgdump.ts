// Leitor de um `pg_dump --schema-only` em formato texto (só texto; não executa nada).
// Cada entrada tem o cabeçalho "-- Name: …; Type: …; Schema: …; Owner: …".

export interface DumpEntry {
  name: string;
  type: string;
  schema: string;
  sql: string;
  /** Ordem no dump (0-based). */
  index: number;
}

const HEADER = /^--\n-- Name: (.*); Type: (.*); Schema: (.*); Owner: .*\n--\n/gm;
const TRAILER = /\n--\n-- PostgreSQL database dump complete\n--[\s\S]*$/;

export function parsePgDump(text: string): DumpEntry[] {
  const clean = text.replace(/^\\(?:un)?restrict .*$/gm, "");
  const heads = [...clean.matchAll(HEADER)];
  return heads.map((h, i) => {
    const from = h.index! + h[0].length;
    const to = i + 1 < heads.length ? heads[i + 1].index! : clean.length;
    const sql = clean.slice(from, to).replace(TRAILER, "").trim();
    return { name: h[1], type: h[2], schema: h[3], sql, index: i };
  });
}

/** Tabela a que a entrada pertence (ou null para tipos, funções e o schema). */
export function tableOf(e: DumpEntry): string | null {
  switch (e.type) {
    case "TABLE":
    case "ROW SECURITY":
      return e.name;
    case "CONSTRAINT":
    case "FK CONSTRAINT":
    case "TRIGGER":
    case "POLICY":
      return e.name.split(" ")[0];
    case "INDEX": {
      const m = /\bON (?:ONLY )?public\.("?)([\w]+)\1/.exec(e.sql);
      return m ? m[2] : null;
    }
    case "COMMENT":
    case "ACL": {
      const m = /^(TABLE|COLUMN) ([\w]+)/.exec(e.name);
      return m ? m[2] : null;
    }
    default:
      return null;
  }
}

/** Nome da função (sem argumentos) para FUNCTION e ACL/COMMENT de função. */
export function functionOf(e: DumpEntry): string | null {
  if (e.type === "FUNCTION") return e.name.slice(0, e.name.indexOf("("));
  const m = /^FUNCTION ([\w]+)\(/.exec(e.name);
  return (e.type === "ACL" || e.type === "COMMENT") && m ? m[1] : null;
}

/** Nome de objeto do cabeçalho sem o prefixo da tabela (constraint, trigger, policy). */
export function objectName(e: DumpEntry): string {
  const t = tableOf(e);
  if (t && ["CONSTRAINT", "FK CONSTRAINT", "TRIGGER", "POLICY"].includes(e.type)) return e.name.slice(t.length + 1);
  return e.name;
}
