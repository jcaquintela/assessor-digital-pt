// Client-safe helpers for property status labels. Kept out of *.server.ts
// so route components can import them without pulling server modules into
// the browser bundle.

export const PROPERTY_STATUSES = [
  "por_angariar",
  "em_angariacao",
  "angariado",
  "ativo",
  "reservado",
  "vendido",
  "arquivado",
] as const;

export function propertyStatusLabel(s: string | null | undefined): string {
  if (!s) return "—";
  switch (s) {
    case "por_angariar": return "Por angariar";
    case "em_angariacao": return "Em angariação";
    case "angariado":
    case "Angariado": return "Angariado";
    case "ativo":
    case "activo": return "Ativo";
    case "reservado": return "Reservado";
    case "vendido": return "Vendido";
    case "arquivado": return "Arquivado";
    default: return s;
  }
}