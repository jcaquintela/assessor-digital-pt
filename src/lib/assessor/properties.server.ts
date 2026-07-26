// Property extraction, matching and title helpers for the Assessor engine.
// Server-only. Regex-based extraction — nothing is invented.

export const PROPERTY_CONTEXT_RE =
  /\b(apartamento|moradia|terreno|loja|escrit[óo]rio|armaz[ée]m|im[óo]vel|angaria[çc][ãa]o|angariei|propriet[áa]ri[oa]|caderneta|certificado\s+energ[ée]tico|licen[çc]a\s+de\s+utiliza[çc][ãa]o|cpu|planta|escritura|certid[ãa]o|artigo\s+matricial|freguesia|habita[çc][ãa]o|pr[ée]dio|t[0-6](?:\+\d)?|v[0-6])\b/i;

export const NEW_PROPERTY_RE =
  /\b(outro\s+im[óo]vel|nova\s+angaria[çc][ãa]o|mais\s+uma\s+angaria[çc][ãa]o|outra\s+angaria[çc][ãa]o|este\s+[ée]\s+diferente|agora\s+outro)\b/i;

export const PROPERTY_REFERENT_RE =
  /\b(este\s+im[óo]vel|essa\s+casa|esse\s+apartamento|esta\s+moradia|o\s+t[0-6]|a\s+angaria[çc][ãa]o|o\s+propriet[áa]rio|a\s+propriet[áa]ria|a\s+casa|o\s+im[óo]vel)\b/i;

const OWNER_RE =
  /\b(propriet[áa]ri[oa]|dono|dona)\b[^.:]*?(?:chama-se|:\s*|\s+[ée]\s+|\s+)([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][A-Za-zÀ-ÿ'’\-]+(?:\s+[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][A-Za-zÀ-ÿ'’\-]+){0,3})/;

export interface PropertyFields {
  typology?: string | null;
  property_type?: string | null; // apartamento/moradia/terreno/etc.
  city?: string | null;
  location?: string | null;
  address?: string | null;
  asking_price?: number | null;
  area_useful?: number | null;
  area_gross?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  parking?: number | null;
  energy_rating?: string | null;
  owner_name?: string | null;
  notes?: string | null;
}

const CITY_HINTS = [
  "espinho","porto","gaia","gondomar","matosinhos","maia","valongo","lisboa","cascais","sintra","almada","oeiras","braga","guimarães","aveiro","coimbra","leiria","faro","funchal","évora","viseu",
];

export function detectPropertyContext(text: string, fileName?: string | null): boolean {
  if (PROPERTY_CONTEXT_RE.test(text)) return true;
  if (fileName && PROPERTY_CONTEXT_RE.test(fileName)) return true;
  return false;
}

export function extractPropertyFields(text: string): PropertyFields {
  const out: PropertyFields = {};
  const t = text;

  const mTip = t.match(/\b([TV][0-6](?:\+[0-9])?)\b/i);
  if (mTip) out.typology = mTip[1].toUpperCase();

  const mKind = t.match(/\b(apartamento|moradia|terreno|loja|escrit[óo]rio|armaz[ée]m)\b/i);
  if (mKind) out.property_type = mKind[1].toLowerCase();

  // Cidade — heurística com lista + padrão "em <Cidade>"
  const lower = t.toLowerCase();
  for (const c of CITY_HINTS) {
    if (new RegExp(`\\b${c}\\b`, "i").test(lower)) {
      out.city = c.charAt(0).toUpperCase() + c.slice(1);
      break;
    }
  }
  if (!out.city) {
    const mLoc = t.match(/\bem\s+([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][A-Za-zÀ-ÿ'’\-]+(?:\s+[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][A-Za-zÀ-ÿ'’\-]+){0,2})/);
    if (mLoc) out.location = mLoc[1];
  }

  // Morada — "rua/av/avenida/travessa/praceta X, nº Y"
  const mAddr = t.match(/\b((?:rua|avenida|av\.|travessa|praceta|largo|estrada)\s+[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][^\.,\n]{2,80})/i);
  if (mAddr) out.address = mAddr[1].trim();

  // Preço
  const price = parsePriceFromText(t);
  if (price !== null) out.asking_price = price;

  // Área — "145 m2", "145m²", "145 metros"
  const mArea = t.match(/\b(\d{2,4})\s*(?:m\s*2|m²|metros?(?:\s+quadrados?)?)\b/i);
  if (mArea) out.area_useful = Number(mArea[1]);

  // Quartos
  const mBed = t.match(/\b(\d)\s*quartos?\b/i);
  if (mBed) out.bedrooms = Number(mBed[1]);

  // WCs
  const mBath = t.match(/\b(\d)\s*(?:wc|casas?\s+de\s+banho|banheiros?)\b/i);
  if (mBath) out.bathrooms = Number(mBath[1]);

  // Garagem / estacionamento
  if (/\bgaragem|estacionamento\b/i.test(t)) out.parking = 1;
  const mPark = t.match(/\b(\d)\s*(?:lugares?\s+de\s+garagem|garagens|estacionamentos?)\b/i);
  if (mPark) out.parking = Number(mPark[1]);

  // Certificado energético — A+, A, B, B-, C, D, E, F
  const mEnr = t.match(/\b(?:certificado\s+energ[ée]tico|classe)\s*[:\-]?\s*([A-F][+\-]?)\b/i);
  if (mEnr) out.energy_rating = mEnr[1].toUpperCase();

  // Proprietário
  const mOwn = t.match(OWNER_RE);
  if (mOwn) out.owner_name = mOwn[2];

  return out;
}

function parsePriceFromText(text: string): number | null {
  const t = text.toLowerCase();
  let m = t.match(/(\d+(?:[.,]\d+)?)\s*(k|mil|m|mi|milh(?:ão|oes|ões))\s*(?:€|eur|euros?)?/);
  if (m) {
    const base = parseFloat(m[1].replace(",", "."));
    const unit = m[2];
    if (unit === "k" || unit === "mil") return Math.round(base * 1_000);
    return Math.round(base * 1_000_000);
  }
  m = t.match(/(\d{1,3}(?:[.\s]\d{3})+|\d{4,})\s*(?:€|eur|euros?)/);
  if (m) {
    const num = parseInt(m[1].replace(/[.\s]/g, ""), 10);
    if (!Number.isNaN(num)) return num;
  }
  return null;
}

export function buildPropertyTitle(f: PropertyFields): string {
  const loc = f.city || f.location;
  const kind = f.property_type ? capitalize(f.property_type) : null;
  if (f.typology && loc) return `${f.typology} em ${loc}`;
  if (kind && f.typology && loc) return `${kind} ${f.typology} em ${loc}`;
  if (kind && loc) return `${kind} em ${loc}`;
  if (f.typology) return `${f.typology}`;
  if (loc) return `Imóvel em ${loc}`;
  return "Imóvel por classificar";
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export interface PropertyMatch {
  id: string;
  title: string;
  typology: string | null;
  city: string | null;
  asking_price: number | null;
  score: number;
}

// Procura imóveis semelhantes do mesmo utilizador. Score baixo — nunca funde
// automaticamente. Só sinaliza para o Assessor pedir confirmação.
export async function findMatchingProperties(
  supabase: any,
  userId: string,
  fields: PropertyFields,
): Promise<PropertyMatch[]> {
  const { data } = await supabase
    .from("properties")
    .select("id, title, typology, city, location, asking_price, address")
    .eq("user_id", userId)
    .limit(50);
  const rows = (data as any[]) ?? [];
  const cityKey = (fields.city || fields.location || "").toLowerCase();
  const typoKey = (fields.typology || "").toLowerCase();
  const priceKey = fields.asking_price ?? null;
  const addrKey = (fields.address || "").toLowerCase();
  const out: PropertyMatch[] = [];
  for (const r of rows) {
    let score = 0;
    const rCity = String(r.city ?? r.location ?? "").toLowerCase();
    const rTypo = String(r.typology ?? "").toLowerCase();
    const rAddr = String(r.address ?? "").toLowerCase();
    if (cityKey && rCity && cityKey === rCity) score += 2;
    if (typoKey && rTypo && typoKey === rTypo) score += 2;
    if (addrKey && rAddr && rAddr.includes(addrKey.slice(0, 12))) score += 3;
    if (priceKey && r.asking_price) {
      const diff = Math.abs(Number(r.asking_price) - priceKey);
      if (diff <= Math.max(5000, priceKey * 0.03)) score += 2;
    }
    if (score >= 3) {
      out.push({
        id: r.id,
        title: r.title,
        typology: r.typology,
        city: r.city,
        asking_price: r.asking_price != null ? Number(r.asking_price) : null,
        score,
      });
    }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 3);
}

export function guessDocumentType(fileName: string | null | undefined, mime: string): string | null {
  const n = (fileName || "").toLowerCase();
  if (/cpu|contrato\s*promessa|contrato-promessa/.test(n)) return "cpu";
  if (/caderneta/.test(n)) return "caderneta_predial";
  if (/certificado.*energ|energ.*cert|cee\b/.test(n)) return "certificado_energetico";
  if (/planta/.test(n)) return "planta";
  if (/licen[çc]a.*utiliza[çc][ãa]o/.test(n)) return "licenca_utilizacao";
  if (/certid[ãa]o/.test(n)) return "certidao";
  if (/contrato/.test(n)) return "contrato";
  if (/comprovativo|recibo|fatura/.test(n)) return "comprovativo";
  if (mime.startsWith("image/")) return "fotografias";
  return null;
}

// Aplica um patch a um imóvel. Devolve as chaves efectivamente alteradas.
export async function updatePropertyPatch(
  supabase: any,
  userId: string,
  propertyId: string,
  patch: Record<string, unknown>,
): Promise<string[]> {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === null || v === "") continue;
    clean[k] = v;
  }
  if (Object.keys(clean).length === 0) return [];
  const { error } = await supabase
    .from("properties")
    .update(clean)
    .eq("id", propertyId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return Object.keys(clean);
}

export async function createPropertyFromFields(
  supabase: any,
  userId: string,
  fields: PropertyFields,
  extras: { channel?: string | null; sourceMessageId?: string | null; notes?: string | null } = {},
): Promise<{ id: string; title: string } | null> {
  const title = buildPropertyTitle(fields);
  const insert: Record<string, unknown> = {
    user_id: userId,
    title,
    typology: fields.typology ?? null,
    property_type: fields.property_type ?? null,
    city: fields.city ?? null,
    location: fields.location ?? fields.city ?? null,
    address: fields.address ?? null,
    asking_price: fields.asking_price ?? null,
    area_useful: fields.area_useful ?? null,
    area_gross: fields.area_gross ?? null,
    bedrooms: fields.bedrooms ?? null,
    bathrooms: fields.bathrooms ?? null,
    parking: fields.parking ?? null,
    energy_rating: fields.energy_rating ?? null,
    status: "Angariado",
    source_channel: extras.channel ?? null,
    source_message_id: extras.sourceMessageId ?? null,
    notes: extras.notes ?? null,
  };
  const { data, error } = await supabase
    .from("properties")
    .insert(insert as never)
    .select("id, title")
    .single();
  if (error) return null;
  return data as { id: string; title: string };
}