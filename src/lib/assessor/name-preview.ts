// Amostras usadas no preview do nome do assistente (Definições).
// São exemplos reais de sítios onde o nome aparece ao consultor.

import { ASSESSOR_NAME_DEFAULT, sanitizeAssessorName } from "@/lib/assessor/assessor-name";

export interface NamePreviewItem {
  /** Onde é que este texto aparece no produto. */
  local: string;
  texto: string;
}

export function assessorNamePreview(raw: string): NamePreviewItem[] {
  const n = sanitizeAssessorName(raw) || ASSESSOR_NAME_DEFAULT;
  return [
    { local: "Menu e ecrã de arranque", texto: `${n} · o teu assessor` },
    { local: "Análise Pro (Imóveis, Negócios, Faturação)", texto: `Análise do ${n}` },
    { local: "Lista vazia (Pessoas)", texto: `Ainda não tens contactos. Usa "+ Adicionar" ou fala com o ${n} por WhatsApp.` },
    { local: "Conversa (bom dia)", texto: `Bom dia! Sou o ${n}. Tens 2 visitas hoje — queres o resumo?` },
    { local: "Lembrete de compromisso", texto: `${n}: visita com a Ana Silva daqui a 15 minutos.` },
    { local: "Email diário", texto: `De: ${n} <ola@meuafonso.com>` },
  ];
}
