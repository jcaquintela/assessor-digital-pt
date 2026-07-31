// Camada de tradução de formato para o Telegram.
//
// O motor gera texto no formato universal do Assessor (o mesmo que o
// WhatsApp usa: *negrito*, _itálico_, listas com "- ", sem monospace).
// No Telegram enviamos com parse_mode "HTML" — mais seguro para texto
// gerado dinamicamente, porque só exige escapar &, < e >, ao contrário do
// MarkdownV2, onde um "." ou "-" não escapado faz a mensagem falhar.

import { formatForWhatsApp } from "@/lib/assessor/culture/whatsapp-format";

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Converte o formato universal (*negrito* / _itálico_) em HTML do Telegram. */
export function formatForTelegram(input: string | null | undefined): string {
  // Reaproveita a normalização comum (monospace fora, listas com "- ",
  // Markdown ** → *) para garantir paridade entre canais.
  const normalized = formatForWhatsApp(input);
  if (!normalized) return "";

  // 1) Escapar primeiro: o texto ainda não tem HTML nosso.
  let out = escapeHtml(normalized);

  // 2) Só depois introduzir as tags — assim nunca são escapadas.
  out = out.replace(/(^|[\s(«"'])\*([^*\n]+)\*(?=$|[\s,.;:!?)»"'])/g, "$1<b>$2</b>");
  out = out.replace(/(^|[\s(«"'])_([^_\n]+)_(?=$|[\s,.;:!?)»"'])/g, "$1<i>$2</i>");

  // 3) Marcadores soltos que não formaram par ficariam visíveis; limpa-os.
  out = out.replace(/(^|\s)\*(?=\S)/g, "$1").replace(/(?<=\S)\*(?=$|\s)/g, "");

  return out.trim();
}

export const TELEGRAM_PARSE_MODE = "HTML" as const;
