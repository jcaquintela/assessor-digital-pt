import { useEffect, useRef } from "react";

/* Presets de visualização: atalhos que o consultor escolhe uma vez e ficam
   guardados. Não substituem a procura nem os filtros — cruzam-se com eles. */

export type PeoplePreset = "todos" | "prioridades" | "sem-seguimento" | "clientes";
export type PropertyPreset = "todos" | "carteira" | "prioridades" | "fechados";

export const PEOPLE_PRESETS: { id: PeoplePreset; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "prioridades", label: "Prioridades" },
  { id: "sem-seguimento", label: "Sem seguimento" },
  { id: "clientes", label: "Clientes" },
];

export const PROPERTY_PRESETS: { id: PropertyPreset; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "carteira", label: "Em carteira" },
  { id: "prioridades", label: "Prioridades" },
  { id: "fechados", label: "Fechados" },
];

const hoje = () => new Date().toISOString().slice(0, 10);

export function isPeoplePreset(v: unknown): v is PeoplePreset {
  return PEOPLE_PRESETS.some((p) => p.id === v);
}
export function isPropertyPreset(v: unknown): v is PropertyPreset {
  return PROPERTY_PRESETS.some((p) => p.id === v);
}

type PessoaLike = {
  relacao?: string;
  proximaAcao?: string;
  proximaAcaoData?: string;
};

/** Prioridade = próxima ação marcada para hoje ou já atrasada. */
export function matchPeoplePreset(p: PessoaLike, preset: PeoplePreset, today = hoje()): boolean {
  switch (preset) {
    case "prioridades":
      return !!p.proximaAcaoData && p.proximaAcaoData.slice(0, 10) <= today;
    case "sem-seguimento":
      return !p.proximaAcao && !p.proximaAcaoData;
    case "clientes":
      return (p.relacao ?? "").toLowerCase() === "cliente";
    default:
      return true;
  }
}

type ImovelLike = {
  status?: string | null;
  asking_price?: number | null;
  value?: number | null;
  address?: string | null;
  location?: string | null;
  city?: string | null;
};

const fechado = (i: ImovelLike) =>
  ["vendido", "arquivado"].includes(String(i.status ?? "").toLowerCase());

/** Prioridade = está em carteira mas com ficha incompleta (sem preço ou sem morada). */
export function matchPropertyPreset(i: ImovelLike, preset: PropertyPreset): boolean {
  switch (preset) {
    case "carteira":
      return !fechado(i);
    case "fechados":
      return fechado(i);
    case "prioridades": {
      if (fechado(i)) return false;
      const semPreco = !(Number(i.asking_price ?? i.value ?? 0) > 0);
      const semMorada = ![i.address, i.city, i.location].some((v) => !!String(v ?? "").trim());
      return semPreco || semMorada;
    }
    default:
      return true;
  }
}

/* ---------- Persistência ---------- */

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key: string, v: string) {
  try { localStorage.setItem(key, v); } catch { /* modo privado: ignora */ }
}

/**
 * Mantém o preset do URL sincronizado com a escolha guardada.
 * - Sem preset no URL: aplica o último preset usado.
 * - Com preset no URL: passa a ser o novo preferido.
 */
export function usePersistedPreset<T extends string>(
  storageKey: string,
  preset: T,
  setPreset: (v: T) => void,
  hasSearchPreset: boolean,
  isValid: (v: unknown) => v is T,
) {
  const applied = useRef(false);

  useEffect(() => {
    if (applied.current) return;
    applied.current = true;
    if (hasSearchPreset) return;
    const saved = read(storageKey);
    if (isValid(saved) && saved !== preset) setPreset(saved);
  }, [hasSearchPreset, preset, setPreset, storageKey, isValid]);

  useEffect(() => {
    if (!applied.current) return;
    write(storageKey, preset);
  }, [preset, storageKey]);
}
