// Exportações geradas no momento do pedido, no browser. Nada é guardado no
// servidor: os dados vêm de uma leitura filtrada por RLS e viram Blob local.

export function dateStamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function csvCell(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Separador ';' — o Excel em PT-PT abre assim sem pedir importação.
export function toCsv(headers: string[], rows: Array<Array<unknown>>): string {
  const lines = [headers.map(csvCell).join(";")];
  for (const r of rows) lines.push(r.map(csvCell).join(";"));
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}

export function csvDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-PT");
}

function vcardEscape(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

export interface VCardContact {
  name: string;
  phone?: string | null;
  email?: string | null;
  note?: string | null;
}

export function buildVCards(contacts: VCardContact[]): string {
  const out: string[] = [];
  for (const c of contacts) {
    const name = (c.name ?? "").trim();
    if (!name) continue;
    const parts = name.split(/\s+/);
    const last = parts.length > 1 ? parts[parts.length - 1] : "";
    const first = parts.length > 1 ? parts.slice(0, -1).join(" ") : name;
    out.push("BEGIN:VCARD");
    out.push("VERSION:3.0");
    out.push(`N:${vcardEscape(last)};${vcardEscape(first)};;;`);
    out.push(`FN:${vcardEscape(name)}`);
    if (c.phone) out.push(`TEL;TYPE=CELL:${vcardEscape(String(c.phone))}`);
    if (c.email) out.push(`EMAIL;TYPE=INTERNET:${vcardEscape(String(c.email))}`);
    if (c.note) out.push(`NOTE:${vcardEscape(String(c.note))}`);
    out.push("END:VCARD");
  }
  return out.join("\r\n") + "\r\n";
}

export function downloadText(filename: string, mime: string, content: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}