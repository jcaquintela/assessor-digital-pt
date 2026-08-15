import { describe, it, expect } from "vitest";
import { looksLikeNoise, triageEmails } from "./triage";
import { formatQueryResults } from "@/lib/assessor/v3/query-results";

const known = [
  { id: "p1", name: "Ana Silva", email_normalized: "ana.silva@exemplo.pt" },
  { id: "p2", name: "Carlos Mendes", email_normalized: "carlos@mendes.pt" },
];

const inbox = [
  { id: "1", from: "Zara <noreply@zara.com>", subject: "Saldos até -50%", sent_at: "2026-08-15T08:00:00Z" },
  { id: "2", from: "Ana Silva <ana.silva@exemplo.pt>", subject: "Visita de sábado", sent_at: "2026-08-15T09:00:00Z" },
  { id: "3", from: "LinkedIn <notifications-noreply@linkedin.com>", subject: "5 novas oportunidades de emprego", sent_at: "2026-08-15T07:00:00Z" },
  { id: "4", from: "Carlos Mendes <carlos@mendes.pt>", subject: "Caderneta predial", sent_at: "2026-08-15T10:00:00Z" },
  { id: "5", from: "Netflix <info@netflix.com>", subject: "A tua fatura mensal", sent_at: "2026-08-15T06:00:00Z" },
  { id: "6", from: "Rita Nogueira <rita@advogados.pt>", subject: "Escritura", sent_at: "2026-08-15T05:00:00Z" },
];

describe("triagem de inbox", () => {
  it("marca newsletters e notificações como ruído", () => {
    expect(looksLikeNoise({ from: "noreply@zara.com", subject: "Saldos" })).toBe(true);
    expect(looksLikeNoise({ from: "notifications-noreply@linkedin.com", subject: "olá" })).toBe(true);
    expect(looksLikeNoise({ from: "no-reply@strava.com", subject: "Resumo semanal" })).toBe(true);
    expect(looksLikeNoise({ from: "Ana Silva <ana.silva@exemplo.pt>", subject: "Visita" })).toBe(false);
    expect(looksLikeNoise({ from: "rita@advogados.pt", subject: "Escritura" })).toBe(false);
  });

  it("põe pessoas conhecidas primeiro", () => {
    const out = triageEmails(inbox, known);
    expect(out.slice(0, 2).map((r) => r.person_name)).toEqual(["Carlos Mendes", "Ana Silva"]);
    expect(out[2]!.bucket).toBe("personal");
    expect(out.filter((r) => r.bucket === "noise")).toHaveLength(3);
  });

  it("resposta default fala das pessoas e conta o ruído", () => {
    const t = triageEmails(inbox, known);
    const relevant = t.filter((r) => r.bucket !== "noise");
    const out = formatQueryResults([{
      name: "search_emails", ok: true, latencyMs: 1,
      data: { items: relevant, total: relevant.length, hidden_noise: 3, filtered: true },
    }])!;
    expect(out).toContain("Ana Silva");
    expect(out).toContain("Carlos Mendes");
    expect(out).toContain("3 emails de newsletters e notificações");
    expect(out).toContain("Queres ver os todos?");
    expect(out).not.toContain("Zara");
  });

  it("quando só há ruído, diz isso e oferece mostrar", () => {
    const out = formatQueryResults([{
      name: "search_emails", ok: true, latencyMs: 1,
      data: { items: [], total: 0, hidden_noise: 10, filtered: true },
    }])!;
    expect(out).toContain("10");
    expect(out).toContain("Queres ver na mesma?");
  });
});
