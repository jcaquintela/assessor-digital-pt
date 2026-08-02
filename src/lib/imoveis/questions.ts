// "Informação por confirmar" — dúvidas concretas derivadas de dados reais que
// ficaram a meio (proposta sem desfecho, visita passada sem resultado, venda
// sem valor). Não inventa: cada dúvida aponta para um registo que existe.
import { formatEUR } from "@/lib/demo-data";

export type QuestionKind =
  | "offer_pending"
  | "visit_no_outcome"
  | "sold_without_price"
  | "owner_missing"
  | "assistant_pending";

export interface OpenQuestion {
  /** Estável entre recargas — usado para o "Ignorar" persistir. */
  key: string;
  kind: QuestionKind;
  text: string;
  refId: string | null;
  confirmLabel: string | null;
  correctLabel: string | null;
}

export interface QuestionsInput {
  property: Record<string, any>;
  owner?: { name?: string | null } | null;
  offers?: { id: string; amount: number; from?: string | null; status: string; date?: string | null }[];
  visits?: { id: string; who?: string | null; dueAt?: string | null; state: string }[];
  assistantPending?: { id: string; question: string }[];
  dismissedKeys?: string[];
  now?: number;
}

function diasDesde(iso: string | null | undefined, now: number): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((now - t) / 864e5);
}

export function propertyOpenQuestions(input: QuestionsInput): OpenQuestion[] {
  const now = input.now ?? Date.now();
  const p = input.property ?? {};
  const out: OpenQuestion[] = [];

  for (const o of input.offers ?? []) {
    if (String(o.status) !== "pendente") continue;
    const dias = diasDesde(o.date, now);
    if (dias != null && dias < 3) continue; // ainda é recente, não vale perguntar
    out.push({
      key: `offer:${o.id}`,
      kind: "offer_pending",
      text: `A proposta de ${formatEUR(Number(o.amount))}${o.from ? ` de ${o.from}` : ""} foi aceite?`,
      refId: o.id,
      confirmLabel: "Foi aceite",
      correctLabel: "Foi recusada",
    });
  }

  for (const v of input.visits ?? []) {
    if (v.state !== "agendada") continue;
    const dias = diasDesde(v.dueAt, now);
    if (dias == null || dias < 1) continue;
    out.push({
      key: `visit:${v.id}`,
      kind: "visit_no_outcome",
      text: `A visita${v.who ? ` com ${v.who}` : ""} de há ${dias} dia${dias === 1 ? "" : "s"} chegou a acontecer?`,
      refId: v.id,
      confirmLabel: "Aconteceu",
      correctLabel: "Não aconteceu",
    });
  }

  if (p.sold_at && (p.sale_price == null || Number(p.sale_price) <= 0)) {
    out.push({
      key: "sold_without_price",
      kind: "sold_without_price",
      text: "Este imóvel está marcado como vendido mas não tem valor de venda registado. Qual foi o valor?",
      refId: null,
      confirmLabel: null,
      correctLabel: null,
    });
  }

  if (!p.owner_person_id && !input.owner?.name) {
    out.push({
      key: "owner_missing",
      kind: "owner_missing",
      text: "Ainda não sabemos quem é o proprietário deste imóvel. Queres associar a pessoa?",
      refId: null,
      confirmLabel: null,
      correctLabel: null,
    });
  }

  for (const a of input.assistantPending ?? []) {
    out.push({
      key: `assistant:${a.id}`,
      kind: "assistant_pending",
      text: a.question,
      refId: a.id,
      confirmLabel: null,
      correctLabel: null,
    });
  }

  const ignoradas = new Set(input.dismissedKeys ?? []);
  return out.filter((q) => !ignoradas.has(q.key));
}
