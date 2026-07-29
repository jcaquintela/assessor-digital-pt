// Parser vCard minimalista (RFC 6350) — só campos essenciais.

export interface VCardParsed {
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  phones: string[];
  emails: string[];
  organization: string | null;
  title: string | null;
  notes: string | null;
}

export function parseVCard(text: string): VCardParsed | null {
  if (!text || !/BEGIN:VCARD/i.test(text)) return null;

  // Junta linhas continuadas ("\n " ou "\n\t")
  const unfolded = text.replace(/\r?\n[ \t]/g, "");
  const lines = unfolded.split(/\r?\n/);

  const out: VCardParsed = {
    fullName: null, firstName: null, lastName: null,
    phones: [], emails: [], organization: null, title: null, notes: null,
  };

  for (const line of lines) {
    if (!line || /^BEGIN:VCARD/i.test(line) || /^END:VCARD/i.test(line) || /^VERSION:/i.test(line)) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const head = line.slice(0, idx);
    const value = line.slice(idx + 1).trim();
    const nameTag = head.split(";")[0].toUpperCase();

    switch (nameTag) {
      case "FN":
        out.fullName = value || null;
        break;
      case "N": {
        const parts = value.split(";");
        out.lastName = parts[0] || null;
        out.firstName = parts[1] || null;
        break;
      }
      case "TEL":
        if (value) out.phones.push(value);
        break;
      case "EMAIL":
        if (value) out.emails.push(value);
        break;
      case "ORG":
        out.organization = value.split(";")[0] || null;
        break;
      case "TITLE":
        out.title = value || null;
        break;
      case "NOTE":
        out.notes = value || null;
        break;
    }
  }

  if (!out.fullName && (out.firstName || out.lastName)) {
    out.fullName = [out.firstName, out.lastName].filter(Boolean).join(" ").trim();
  }

  return out;
}