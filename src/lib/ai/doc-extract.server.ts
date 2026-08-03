// Leitura de documentos imobiliários (PDF ou foto de documento) via Lovable AI.
// Extrai apenas o que está escrito: tipo, datas, NIF, artigo matricial, fração
// e morada. NÃO escreve na base de dados — devolve o que leu.

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "openai/gpt-5.6-sol";

export interface DocReading {
  doc_type: string | null;       // ex.: "Caderneta Predial", "Certidão Permanente"
  title_hint: string | null;     // nome curto sugerido para o ficheiro
  issued_on: string | null;      // YYYY-MM-DD
  expires_on: string | null;     // YYYY-MM-DD
  nif: string | null;
  artigo_matricial: string | null;
  fracao: string | null;
  morada: string | null;
  visible_text: string | null;
}

export type ReadDocumentResult =
  | { ok: true; reading: DocReading }
  | { ok: false; error: string };

const SUPPORTED_DOC = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

export function supportsDocExtraction(mimeType: string): boolean {
  return SUPPORTED_DOC.has(mimeType.toLowerCase().split(";")[0].trim());
}

const PROMPT = `És um assistente de um consultor imobiliário português.
Lês um documento (caderneta predial, certidão permanente, certificado energético,
licença de utilização, CPCV, contrato, fatura, planta, etc.).
Responde apenas com JSON válido, sem markdown:
{
  "doc_type": string|null,          // tipo do documento em PT-PT, ex.: "Caderneta Predial"
  "title_hint": string|null,        // nome curto para o ficheiro, ex.: "Caderneta Predial - Moradia Gaia"
  "issued_on": string|null,         // data de emissão em YYYY-MM-DD
  "expires_on": string|null,        // data de validade/caducidade em YYYY-MM-DD
  "nif": string|null,               // NIF/NIPC (9 dígitos)
  "artigo_matricial": string|null,  // artigo matricial
  "fracao": string|null,            // letra ou identificação da fração
  "morada": string|null,            // morada do imóvel referida no documento
  "visible_text": string|null       // texto principal legível (máx. ~1500 caracteres)
}
Não inventes nada: o que não estiver escrito fica null. Datas sempre YYYY-MM-DD.`;

function parseJsonLoose(raw: string): any | null {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { /* noop */ }
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

function isoDate(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const year = d.getUTCFullYear();
  if (year < 1900 || year > 2100) return null;
  return s;
}

function coerce(parsed: any): DocReading {
  const str = (v: unknown, max = 200): string | null => {
    const s = String(v ?? "").trim();
    return s && s.toLowerCase() !== "null" ? s.slice(0, max) : null;
  };
  const nifRaw = String(parsed?.nif ?? "").replace(/\D/g, "");
  return {
    doc_type: str(parsed?.doc_type, 80),
    title_hint: str(parsed?.title_hint, 90),
    issued_on: isoDate(parsed?.issued_on),
    expires_on: isoDate(parsed?.expires_on),
    nif: nifRaw.length === 9 ? nifRaw : null,
    artigo_matricial: str(parsed?.artigo_matricial, 40),
    fracao: str(parsed?.fracao, 20),
    morada: str(parsed?.morada, 200),
    visible_text: str(parsed?.visible_text, 1500),
  };
}

export function hasAnyDocData(r: DocReading): boolean {
  return Boolean(
    r.doc_type || r.issued_on || r.expires_on || r.nif || r.artigo_matricial || r.fracao || r.morada,
  );
}

export async function readDocument(
  bytes: Uint8Array,
  mimeType: string,
  fileName?: string | null,
): Promise<ReadDocumentResult> {
  const key = process.env['LOVABLE_API_KEY'];
  if (!key) return { ok: false, error: "LOVABLE_API_KEY missing" };
  const mime = mimeType.toLowerCase().split(";")[0].trim();
  if (!supportsDocExtraction(mime)) return { ok: false, error: `Unsupported mime: ${mimeType}` };

  const base64 = Buffer.from(bytes).toString("base64");
  const content =
    mime === "application/pdf"
      ? [
          { type: "text", text: PROMPT },
          {
            type: "file",
            file: {
              filename: fileName?.trim() || "documento.pdf",
              file_data: `data:${mime};base64,${base64}`,
            },
          },
        ]
      : [
          { type: "text", text: PROMPT },
          { type: "image_url", image_url: { url: `data:${mime};base64,${base64}` } },
        ];

  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      reasoning_effort: "none",
      messages: [{ role: "user", content }],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    return { ok: false, error: `Gateway ${res.status}: ${t.slice(0, 300)}` };
  }
  const json = (await res.json()) as any;
  const parsed = parseJsonLoose(json?.choices?.[0]?.message?.content ?? "");
  if (!parsed) return { ok: false, error: "Sem conteúdo interpretável" };
  return { ok: true, reading: coerce(parsed) };
}
