// Leitura de imagens via Lovable AI Gateway (Gemini multimodal).
// Extrai o texto visível de uma foto — tipicamente uma placa "Vende-se" —
// para o motor poder criar a lead sem o consultor escrever o número.
// NÃO escreve na BD: só devolve o que leu.

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const VISION_MODEL = "google/gemini-3.6-flash";

const SUPPORTED = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif"]);

export interface ImageReading {
  is_sign: boolean;
  visible_text: string | null;
  phones: string[];
  agency_name: string | null;
  listing_type: "owner_sale" | "other_agency" | "unknown";
  property_type: string | null;
  typology: string | null;
  location: string | null;
  price: number | null;
  description: string | null;
}

export type ReadImageResult =
  | { ok: true; reading: ImageReading }
  | { ok: false; error: string };

const PROMPT = `Observas uma fotografia enviada por um consultor imobiliário português.
Lê TODO o texto visível na imagem (placas, letreiros, cartazes, anúncios, documentos).
Responde apenas com JSON válido, sem markdown, com estas chaves:
{
  "is_sign": boolean,            // true se for uma placa/letreiro de venda ou arrendamento
  "visible_text": string|null,   // todo o texto legível, tal como aparece
  "phones": string[],            // números de telefone visíveis, só dígitos e +
  "agency_name": string|null,    // nome da agência/imobiliária, se aparecer
  "listing_type": "owner_sale"|"other_agency"|"unknown",
  "property_type": string|null,  // apartamento, moradia, terreno, loja...
  "typology": string|null,       // T2, T3...
  "location": string|null,       // localidade/rua visível
  "price": number|null,          // valor em euros, só o número
  "description": string|null     // 1 frase em PT-PT a descrever a foto
}
Não inventes: o que não estiver visível fica null ou lista vazia.`;

function parseJsonLoose(raw: string): any | null {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { /* noop */ }
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

function coerce(parsed: any): ImageReading {
  const phones = Array.isArray(parsed?.phones)
    ? parsed.phones
        .map((p: unknown) => String(p ?? "").replace(/[^\d+]/g, ""))
        .filter((p: string) => p.replace(/\D/g, "").length >= 9)
        .slice(0, 5)
    : [];
  const lt = String(parsed?.listing_type ?? "unknown");
  const rawPrice = Number(String(parsed?.price ?? "").replace(/[^\d.]/g, ""));
  const str = (v: unknown, max = 200): string | null => {
    const s = String(v ?? "").trim();
    return s && s !== "null" ? s.slice(0, max) : null;
  };
  return {
    is_sign: parsed?.is_sign === true,
    visible_text: str(parsed?.visible_text, 1500),
    phones,
    agency_name: str(parsed?.agency_name, 120),
    listing_type: lt === "owner_sale" || lt === "other_agency" ? lt : "unknown",
    property_type: str(parsed?.property_type, 60),
    typology: str(parsed?.typology, 20),
    location: str(parsed?.location, 120),
    price: Number.isFinite(rawPrice) && rawPrice > 0 ? rawPrice : null,
    description: str(parsed?.description, 300),
  };
}

export function supportsVision(mimeType: string): boolean {
  return SUPPORTED.has(mimeType.toLowerCase().split(";")[0].trim());
}

export async function readImage(bytes: Uint8Array, mimeType: string): Promise<ReadImageResult> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return { ok: false, error: "LOVABLE_API_KEY missing" };
  const mime = mimeType.toLowerCase().split(";")[0].trim();
  if (!supportsVision(mime)) return { ok: false, error: `Unsupported image mime: ${mimeType}` };

  const body = {
    model: VISION_MODEL,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: PROMPT },
          {
            type: "image_url",
            image_url: { url: `data:${mime};base64,${Buffer.from(bytes).toString("base64")}` },
          },
        ],
      },
    ],
    temperature: 0,
    response_format: { type: "json_object" },
  };

  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    return { ok: false, error: `Gateway ${res.status}: ${t.slice(0, 300)}` };
  }
  const json = (await res.json()) as any;
  const content: string | undefined = json?.choices?.[0]?.message?.content;
  const parsed = parseJsonLoose(content ?? "");
  if (!parsed) return { ok: false, error: "Vision returned no parsable content" };
  return { ok: true, reading: coerce(parsed) };
}

// Traduz a leitura para uma frase natural que o motor processa como se o
// consultor a tivesse escrito. É este texto que alimenta THINK/DECIDE.
export function readingToEngineText(reading: ImageReading, caption?: string | null): string | null {
  const bits: string[] = [];
  if (reading.is_sign) {
    const tipo = [reading.typology, reading.property_type].filter(Boolean).join(" ");
    bits.push(`Vi uma placa${tipo ? ` de ${tipo}` : ""}${reading.location ? ` em ${reading.location}` : ""}.`);
  }
  if (reading.phones.length) bits.push(`Telefone: ${reading.phones.join(", ")}.`);
  if (reading.agency_name) bits.push(`Agência: ${reading.agency_name}.`);
  else if (reading.is_sign && reading.listing_type === "owner_sale") bits.push("É de particular.");
  if (reading.price) bits.push(`Pede ${reading.price}€.`);
  if (caption?.trim()) bits.push(caption.trim());
  if (!bits.length) return null;
  if (reading.visible_text) bits.push(`Texto da placa: "${reading.visible_text}".`);
  return bits.join(" ");
}
