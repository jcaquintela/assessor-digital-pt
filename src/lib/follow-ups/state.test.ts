import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { isFollowUpOpen, isFollowUpClosed, isFollowUpEvent, followUpStateLabel } from "./state";
import { isOpenFollowUp } from "@/lib/assessor/supreme/overview.server";
import { isOpenFollowUpStatus } from "@/lib/assessor/outcome-status";
import { isAgendaEvent } from "@/lib/agenda-kind";

// ---------------------------------------------------------------------------
// GOLDEN CROSS-SURFACE — 12 casos. Cada caso tem de ser lido da MESMA maneira
// por todas as superfícies (Hoje, Seguimentos, Resumo Geral, Prioridades,
// Proatividade). Se um destes falhar, existe outra vez uma regra divergente.
// ---------------------------------------------------------------------------

const surfacesOpen = (row: any) => ({
  canonica: isFollowUpOpen(row),
  resumoGeral: isOpenFollowUp(row.status),
  seguimentos: isOpenFollowUpStatus(row.status),
});

describe("golden cross-surface: aberto/fechado", () => {
  it("#1 pendente sem resultado está aberto em todas as superfícies", () => {
    const row = { status: "Pendente", outcome: null, archived_at: null };
    expect(surfacesOpen(row)).toEqual({ canonica: true, resumoGeral: true, seguimentos: true });
  });

  it("#2 'Concluído' com acento fecha em todas as superfícies", () => {
    const row = { status: "Concluído", outcome: null, archived_at: null };
    expect(surfacesOpen(row)).toEqual({ canonica: false, resumoGeral: false, seguimentos: false });
  });

  it("#3 'concluido' sem acento e em minúsculas fecha na mesma", () => {
    const row = { status: "concluido", outcome: null, archived_at: null };
    expect(surfacesOpen(row)).toEqual({ canonica: false, resumoGeral: false, seguimentos: false });
  });

  it("#4 archived_at fecha mesmo com status pendente", () => {
    const row = { status: "Pendente", outcome: null, archived_at: "2026-08-01T10:00:00Z" };
    expect(isFollowUpClosed(row)).toBe(true);
  });

  it("#5 outcome terminal 'nao_realizado' fecha mesmo com status pendente", () => {
    expect(isFollowUpOpen({ status: "Pendente", outcome: "nao_realizado" })).toBe(false);
  });

  it("#6 outcome 'precisa_nova_acao' MANTÉM aberto", () => {
    expect(isFollowUpOpen({ status: "Pendente", outcome: "precisa_nova_acao" })).toBe(true);
  });

  it("#7 outcome 'adiado' MANTÉM aberto", () => {
    expect(isFollowUpOpen({ status: "Pendente", outcome: "adiado" })).toBe(true);
  });

  it("#8 status vazio conta como aberto (não inventa fecho)", () => {
    expect(surfacesOpen({ status: "", outcome: null, archived_at: null }).canonica).toBe(true);
    expect(isOpenFollowUpStatus(null)).toBe(true);
  });

  it("#9 rótulo de estado é coerente com o fecho", () => {
    expect(followUpStateLabel({ status: "cancelado" })).toBe("Cancelado");
    expect(followUpStateLabel({ status: "Pendente", archived_at: "2026-01-01" })).toBe("Arquivado");
    expect(followUpStateLabel({ status: "Concluído" })).toBe("Concluído");
    expect(followUpStateLabel({ status: "Pendente" })).toBeNull();
  });
});

describe("golden cross-surface: Evento vs Tarefa", () => {
  it("#10 classificação Evento/Tarefa usa um único classificador", () => {
    const evento = { type: "visita", due_time: "10:00" };
    const tarefa = { type: "chamada", due_time: "10:00" };
    const semTipoComHora = { type: "outro", due_time: "09:30" };
    const semTipoSemHora = { type: "outro", due_time: null };

    expect(isFollowUpEvent(evento)).toBe(isAgendaEvent(evento.type, evento.due_time));
    expect(isFollowUpEvent(evento)).toBe(true);
    expect(isFollowUpEvent(tarefa)).toBe(false);
    expect(isFollowUpEvent(semTipoComHora)).toBe(true);
    expect(isFollowUpEvent(semTipoSemHora)).toBe(false);
  });

  it("#11 cenário 'Venda do terreno': mesmo registo, leitura igual em todas as superfícies", () => {
    // Regressão real: aparecia activo em /hoje e concluído em /negocios.
    const vendaTerreno = {
      title: "Venda do terreno",
      type: "reuniao_angariacao",
      due_time: "15:00",
      status: "Concluído",
      outcome: "concluido",
      archived_at: null,
    };
    const leituras = surfacesOpen(vendaTerreno);
    expect(new Set(Object.values(leituras)).size).toBe(1);
    expect(leituras.canonica).toBe(false);
    expect(followUpStateLabel(vendaTerreno)).toBe("Concluído");
    expect(isFollowUpEvent(vendaTerreno)).toBe(true);

    // E enquanto estava aberto, também tinha de ser lido igual por todos.
    const aberto = { ...vendaTerreno, status: "Pendente", outcome: null };
    const leiturasAberto = surfacesOpen(aberto);
    expect(new Set(Object.values(leiturasAberto)).size).toBe(1);
    expect(leiturasAberto.canonica).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// F.12 — GUARDA ESTRUTURAL: impedir que volte a nascer uma regra paralela.
// ---------------------------------------------------------------------------

const ALLOWED_FILES = new Set([
  "src/lib/follow-ups/state.ts",
  "src/lib/follow-ups/state.test.ts",
  "src/lib/assessor/outcome-status.ts",
  "src/lib/assessor/outcome-status.test.ts",
  "src/lib/agenda-kind.ts",
  "src/lib/agenda-kind.test.ts",
  // Negócios (opportunities) têm o seu próprio ciclo de fases.
  "src/lib/deals/stages.ts",
  "src/lib/deals/stages.test.ts",
  "src/lib/deals/closed.test.ts",
  "src/integrations/supabase/types.ts",
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

describe("guarda estrutural (F.12)", () => {
  it("#12 nenhum ficheiro define a sua própria lista de estados terminais de follow-up", () => {
    const offenders: string[] = [];
    for (const file of walk("src")) {
      const rel = file.replace(/\\/g, "/");
      if (ALLOWED_FILES.has(rel)) continue;
      const src = readFileSync(file, "utf8");
      // Um Set/array literal que junte dois ou mais estados terminais é, por
      // definição, uma segunda fonte de verdade.
      for (const match of src.matchAll(/(?:new Set\(\[|=\s*\[)([^\]]*)\]/g)) {
        const body = (match[1] ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const hits = ["concluido", "cancelado", "arquivado"].filter((t) => body.includes(`"${t}`) || body.includes(`'${t}`));
        if (hits.length >= 2) offenders.push(`${rel}: ${hits.join(", ")}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});