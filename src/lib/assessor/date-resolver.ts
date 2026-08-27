// Resolve explicit date/time expressions in the user's current message.
// Timezone: Europe/Lisbon. Returns only what is explicitly present in the text.
// Never invents dates. Used to override AI extraction so "amanhã" is never
// silently converted to "hoje" (or vice versa).

import { lisbonYmd } from "./lisbon-day";

const MESES: Record<string, number> = {
  janeiro: 0, fevereiro: 1, março: 2, marco: 2, abril: 3, maio: 4, junho: 5,
  julho: 6, agosto: 7, setembro: 8, outubro: 9, novembro: 10, dezembro: 11,
};
const DIAS_SEMANA: Record<string, number> = {
  domingo: 0, segunda: 1, "segunda-feira": 1, terça: 2, terca: 2,
  "terça-feira": 2, "terca-feira": 2, quarta: 3, "quarta-feira": 3,
  quinta: 4, "quinta-feira": 4, sexta: 5, "sexta-feira": 5,
  sábado: 6, sabado: 6,
};

// Dia de calendário em Lisboa — fonte única em lisbon-day.ts.
function ymdInLisbon(d: Date): string {
  return lisbonYmd(d);
}

function addDaysYmd(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map((n) => parseInt(n, 10));
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() + delta);
  return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, "0")}-${String(base.getUTCDate()).padStart(2, "0")}`;
}

function dayOfWeekYmd(ymd: string): number {
  const [y, m, d] = ymd.split("-").map((n) => parseInt(n, 10));
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export interface ResolvedDateTime {
  date: string | null; // YYYY-MM-DD, Lisbon calendar
  time: string | null; // HH:mm 24h
  expression: string | null; // original phrase, for auditing
}

export function resolveDateTimeFromText(
  text: string,
  now: Date = new Date(),
): ResolvedDateTime {
  const t = text.toLowerCase();
  const todayYmd = ymdInLisbon(now);
  let date: string | null = null;
  let expression: string | null = null;

  if (/(?:^|[^\p{L}])depois\s+de\s+amanh[ãa](?![\p{L}])/u.test(t)) {
    date = addDaysYmd(todayYmd, 2);
    expression = "depois de amanhã";
  } else if (/(?:^|[^\p{L}])amanh[ãa](?![\p{L}])/u.test(t)) {
    date = addDaysYmd(todayYmd, 1);
    expression = "amanhã";
  } else if (/\bhoje\b/.test(t)) {
    date = todayYmd;
    expression = "hoje";
  } else if (/\bontem\b/.test(t)) {
    date = addDaysYmd(todayYmd, -1);
    expression = "ontem";
  } else {
    for (const k of Object.keys(DIAS_SEMANA)) {
      if (new RegExp(`(?:^|[^\\p{L}])${k}(?![\\p{L}])`, "u").test(t)) {
        const target = DIAS_SEMANA[k];
        const cur = dayOfWeekYmd(todayYmd);
        const diff = (target - cur + 7) % 7 || 7;
        date = addDaysYmd(todayYmd, diff);
        expression = k;
        break;
      }
    }
    if (!date) {
      // "29 de julho", "29 julho", "dia 29 de julho"
      const m = t.match(/(?:dia\s+)?(\d{1,2})\s+(?:de\s+)?([a-zç]+)(?:\s+de\s+(\d{4}))?/);
      if (m && MESES[m[2]] !== undefined) {
        const dia = parseInt(m[1], 10);
        const mes = MESES[m[2]];
        const [yStr] = todayYmd.split("-");
        const ano = m[3] ? parseInt(m[3], 10) : parseInt(yStr, 10);
        const candidate = `${ano}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
        date = candidate < todayYmd && !m[3] ? `${ano + 1}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}` : candidate;
        expression = m[0];
      }
    }
    if (!date) {
      const m = t.match(/\b(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?\b/);
      if (m) {
        const dia = parseInt(m[1], 10);
        const mes = parseInt(m[2], 10);
        const [yStr] = todayYmd.split("-");
        let ano = m[3] ? parseInt(m[3], 10) : parseInt(yStr, 10);
        if (ano < 100) ano += 2000;
        date = `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
        expression = m[0];
      }
    }
  }

  // hora: "10h", "10:30", "10h30", "às 11h", "às 15h00", "pelas 10h"
  let time: string | null = null;
  const mh = t.match(/\b(?:(?:às|as|pelas|pelas as)\s+)?(\d{1,2})\s*(?:h|:)\s*(\d{2})?\b/);
  if (mh) {
    const hh = parseInt(mh[1], 10);
    const mm = mh[2] ? parseInt(mh[2], 10) : 0;
    if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
      time = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    }
  }

  return { date, time, expression };
}

// True when the text contains any explicit date/time expression.
export function hasExplicitDateTime(text: string): boolean {
  const r = resolveDateTimeFromText(text);
  return !!(r.date || r.time);
}
