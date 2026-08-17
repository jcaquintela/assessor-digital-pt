// Cartões canónicos de Faturação (Comissões, Despesas, Faturas). Puro.
// Regra de produto: os grupos canónicos aparecem sempre, mesmo a zero.

import { buildGroupCards, type GroupCard } from "@/lib/ui/group-cards";

export type EstadoComissao = "Prevista" | "Faturada" | "Recebida";
export const ESTADOS_COMISSAO: EstadoComissao[] = ["Prevista", "Faturada", "Recebida"];
export const CATEGORIAS_DESPESA = ["Deslocação", "Marketing", "Escritório", "Formação", "Outros"] as const;

export const FATURA_GRUPOS: { key: string; label: string; estados: EstadoComissao[] }[] = [
  { key: "por_faturar", label: "Por faturar", estados: ["Prevista"] },
  { key: "emitida", label: "Emitida", estados: ["Faturada"] },
  { key: "paga", label: "Paga", estados: ["Recebida"] },
];

export type AbaFaturacao = "comissoes" | "despesas" | "faturas";

export function faturacaoCards<
  C extends { estado: string },
  D extends { categoria: string },
>(aba: AbaFaturacao, comissoes: C[], despesas: D[]): GroupCard<C | D>[] {
  if (aba === "comissoes") {
    return buildGroupCards<C | D>(
      ESTADOS_COMISSAO.map((e) => ({ key: e, label: e, items: comissoes.filter((c) => c.estado === e) })),
    );
  }
  if (aba === "faturas") {
    return buildGroupCards<C | D>(
      FATURA_GRUPOS.map((g) => ({
        key: g.key,
        label: g.label,
        items: comissoes.filter((c) => (g.estados as string[]).includes(c.estado)),
      })),
    );
  }
  return buildGroupCards<C | D>(
    CATEGORIAS_DESPESA.map((c) => ({ key: c, label: c, items: despesas.filter((d) => d.categoria === c) })),
  );
}
