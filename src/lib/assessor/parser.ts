// Parser PT-PT para texto livre do consultor.
// Não inventa valores: devolve apenas o que consegue extrair do texto.
// Timezone: Europe/Lisbon (assume que o browser do consultor está em PT).

export type Intencao = "seguimento" | "despesa" | "comissao" | "conversa" | "briefing" | "procura";

export interface Extraidos {
  intencao: Intencao;
  nome?: string;
  data?: string; // ISO
  hora?: string; // HH:mm
  valor?: number;
  categoria?: string;
  descricao?: string;
}

const CATEGORIAS: Record<string, string> = {
  portagem: "Deslocação",
  portagens: "Deslocação",
  combustível: "Deslocação",
  combustivel: "Deslocação",
  gasolina: "Deslocação",
  gasóleo: "Deslocação",
  parque: "Deslocação",
  estacionamento: "Deslocação",
  almoço: "Deslocação",
  jantar: "Deslocação",
  anúncio: "Marketing",
  anuncio: "Marketing",
  idealista: "Marketing",
  publicidade: "Marketing",
  formação: "Formação",
  formacao: "Formação",
  escritório: "Escritório",
  escritorio: "Escritório",
};

function detectarIntencao(texto: string): Intencao {
  const t = texto.toLowerCase();
  if (/\b(comiss[ãa]o|comissoes)\b/.test(t)) return "comissao";
  if (/\b(despesa|gastei|gasto|paguei|portagem|combust[íi]vel|almo[çc]o|jantar|an[úu]ncio|idealista)\b/.test(t)) return "despesa";
  if (/(o que tenho|meu dia|briefing|hoje)/.test(t) && !/\b(ligar|marcar|visita|reuni[ãa]o|enviar)\b/.test(t)) return "briefing";
  if (/^(procurar|onde|quanto|quem)\b/.test(t)) return "procura";
  if (/\b(ligar|telefonar|marcar|visita|reuni[ãa]o|enviar|responder|confirmar|preparar|contactar)\b/.test(t)) return "seguimento";
  return "conversa";
}

function extrairNome(texto: string): string | undefined {
  // "ao João", "à Ana Silva", "com o Miguel", "com a Rita Fernandes"
  const m = texto.match(/\b(?:ao|à|a\s+o|a\s+a|com\s+(?:o|a)|para\s+(?:o|a))\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+(?:\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+)?)/);
  if (m) return m[1];
  return undefined;
}

function extrairValor(texto: string): number | undefined {
  // 38,50 euros | 38.50 € | 4500€ | 4.500 euros | 4500 eur
  const m = texto.match(/(\d{1,3}(?:[.\s]\d{3})*(?:[,.]\d{1,2})?)\s*(?:€|eur|euros?)\b/i);
  if (!m) return undefined;
  const raw = m[1].replace(/\s/g, "");
  // 4.500,50 (pt) vs 4500.50 (en) — se tem vírgula, é decimal PT
  let n: number;
  if (raw.includes(",")) {
    n = Number(raw.replace(/\./g, "").replace(",", "."));
  } else {
    // "4.500" pode ser milhar PT ou decimal EN. Assumir milhar PT se pontos aparecem antes de 3 dígitos.
    if (/\.\d{3}(?!\d)/.test(raw)) n = Number(raw.replace(/\./g, ""));
    else n = Number(raw);
  }
  return isFinite(n) ? n : undefined;
}

function extrairCategoria(texto: string): string | undefined {
  const t = texto.toLowerCase();
  for (const k in CATEGORIAS) if (t.includes(k)) return CATEGORIAS[k];
  return undefined;
}

const MESES: Record<string, number> = {
  janeiro: 0, fevereiro: 1, março: 2, marco: 2, abril: 3, maio: 4, junho: 5,
  julho: 6, agosto: 7, setembro: 8, outubro: 9, novembro: 10, dezembro: 11,
};
const DIAS_SEMANA: Record<string, number> = {
  domingo: 0, "segunda": 1, "segunda-feira": 1, "terça": 2, "terca": 2, "terça-feira": 2, "terca-feira": 2,
  "quarta": 3, "quarta-feira": 3, "quinta": 4, "quinta-feira": 4,
  "sexta": 5, "sexta-feira": 5, "sábado": 6, "sabado": 6,
};

function nextDayOfWeek(base: Date, target: number): Date {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  const diff = (target - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + diff);
  return d;
}

function extrairDataHora(texto: string): { data?: string; hora?: string } {
  const t = texto.toLowerCase();
  const now = new Date();
  let base: Date | undefined;

  if (/\bhoje\b/.test(t)) base = new Date(now);
  else if (/\bamanh[ãa]\b/.test(t)) { base = new Date(now); base.setDate(base.getDate() + 1); }
  else if (/\b(depois\s+de\s+amanh[ãa])\b/.test(t)) { base = new Date(now); base.setDate(base.getDate() + 2); }
  else {
    // dia da semana
    for (const k in DIAS_SEMANA) {
      if (new RegExp(`\\b${k}\\b`).test(t)) { base = nextDayOfWeek(now, DIAS_SEMANA[k]); break; }
    }
    // "15 de agosto"
    if (!base) {
      const m = t.match(/(\d{1,2})\s+de\s+([a-zç]+)(?:\s+de\s+(\d{4}))?/);
      if (m && MESES[m[2]] !== undefined) {
        const dia = parseInt(m[1], 10);
        const mes = MESES[m[2]];
        const ano = m[3] ? parseInt(m[3], 10) : now.getFullYear();
        base = new Date(ano, mes, dia, 0, 0, 0, 0);
        if (base < now && !m[3]) base.setFullYear(ano + 1); // se já passou este ano, próximo
      }
    }
    // "20/08" ou "20/08/2026"
    if (!base) {
      const m = t.match(/\b(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?\b/);
      if (m) {
        const dia = parseInt(m[1], 10), mes = parseInt(m[2], 10) - 1;
        let ano = m[3] ? parseInt(m[3], 10) : now.getFullYear();
        if (ano < 100) ano += 2000;
        base = new Date(ano, mes, dia, 0, 0, 0, 0);
      }
    }
  }

  // hora: "10h", "10:30", "10h30", "às 11h", "às 15h00"
  let hora: string | undefined;
  const mh = t.match(/\b(?:às\s+)?(\d{1,2})\s*(?:h|:)\s*(\d{2})?\b/);
  if (mh) {
    const hh = parseInt(mh[1], 10);
    const mm = mh[2] ? parseInt(mh[2], 10) : 0;
    if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
      hora = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
      if (base) base.setHours(hh, mm, 0, 0);
    }
  }

  return { data: base?.toISOString(), hora };
}

export function parse(texto: string): Extraidos {
  const intencao = detectarIntencao(texto);
  const { data, hora } = extrairDataHora(texto);
  return {
    intencao,
    nome: extrairNome(texto),
    data,
    hora,
    valor: extrairValor(texto),
    categoria: extrairCategoria(texto),
    descricao: texto,
  };
}

export function isoAmanha(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

export function isoHoje(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}