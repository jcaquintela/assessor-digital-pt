// O mesmo imóvel anunciado em vários portais (e no site público zome.pt)
// aparece uma só vez, com os outros links em "Também em".
//
// Mesmo imóvel quando:
// 1. a referência ZMPT é a mesma (sinal forte); ou
// 2. sem referência em pelo menos um dos lados: mesma tipologia, preço a
//    ±1%, localização compatível E área útil a ±3% nos dois lados. Sem
//    área, só se junta com preço igual e a mesma localização detalhada
//    (freguesia + concelho). Sem preço ou sem localização nunca se junta:
//    "T1 em Gaia a 139k" sozinho não chega para dizer que é o mesmo imóvel.
// Qual fica à frente: o que tem mais campos verificados; empate → URL.
// Nunca se favorece uma fonte.

import { foldText } from "@/lib/search/normalize";
import { normalizeZmpt } from "@/lib/imoveis/zome-public";
import type { ListingProposal } from "./proposal-format";

const close = (a: number, b: number, tol: number) => Math.abs(a - b) <= Math.max(a, b) * tol;

function sameLocation(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const fa = foldText(a);
  const fb = foldText(b);
  return fa.includes(fb) || fb.includes(fa) || fa.split(",")[0]!.trim() === fb.split(",")[0]!.trim();
}

export function sameProperty(a: ListingProposal, b: ListingProposal): boolean {
  const ra = normalizeZmpt(a.zmptRef);
  const rb = normalizeZmpt(b.zmptRef);
  if (ra && rb) return ra === rb;
  if (a.price == null || b.price == null || !a.typology || !b.typology) return false;
  if (foldText(a.typology) !== foldText(b.typology)) return false;
  if (!close(a.price, b.price, 0.01)) return false;
  if (!sameLocation(a.location, b.location)) return false;
  if (a.areaM2 != null && b.areaM2 != null) return close(a.areaM2, b.areaM2, 0.03);
  const detailed = (l: string | null) => (l ?? "").split(",").filter((x) => x.trim()).length >= 2;
  return a.price === b.price && detailed(a.location) && foldText(a.location) === foldText(b.location);
}

const score = (p: ListingProposal) =>
  [p.price, p.typology, p.location, p.areaM2, p.zmptRef].filter((x) => x != null).length + (p.verification === "page" ? 1 : 0);

function primaryFirst(a: ListingProposal, b: ListingProposal): number {
  return score(b) - score(a) || (a.url < b.url ? -1 : a.url > b.url ? 1 : 0);
}

export function dedupeListings(list: ListingProposal[]): ListingProposal[] {
  const groups: ListingProposal[][] = [];
  for (const p of list) {
    if (!/^https?:\/\//.test(p.url)) continue;
    const g = groups.find((grp) => grp.some((q) => q.url === p.url || sameProperty(q, p)));
    if (g) { if (!g.some((q) => q.url === p.url)) g.push(p); } else groups.push([p]);
  }
  return groups.map((g) => {
    const [head, ...rest] = [...g].sort(primaryFirst);
    if (!rest.length) return head!;
    return {
      ...head!,
      zmptRef: head!.zmptRef ?? rest.find((r) => r.zmptRef)?.zmptRef ?? null,
      alsoAt: rest.map((r) => ({ url: r.url, sourceLabel: r.sourceLabel })),
    };
  });
}
