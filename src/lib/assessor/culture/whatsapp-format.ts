// Formatação das respostas do Assessor para WhatsApp.
//
// O WhatsApp não usa Markdown standard: negrito é *texto*, itálico é
// _texto_ e o monospace (```) não combina com o tom do Afonso. Esta camada
// é o último passo antes do envio — normaliza tudo o que o modelo (ou os
// fast-paths determinísticos) tenham escrito.

export function boldWa(text: string | null | undefined): string {
  const s = String(text ?? "").trim();
  if (!s) return "";
  return `*${s.replace(/\*/g, "")}*`;
}

export function italicWa(text: string | null | undefined): string {
  const s = String(text ?? "").trim();
  if (!s) return "";
  return `_${s.replace(/_/g, "")}_`;
}

// Converte Markdown standard e marcadores variados para a sintaxe do WhatsApp.
export function formatForWhatsApp(input: string | null | undefined): string {
  let out = String(input ?? "").replace(/\r\n/g, "\n");
  if (!out.trim()) return "";

  // 4. Nunca monospace: remove blocos e inline code, mantendo o conteúdo.
  out = out.replace(/```+\s*([\s\S]*?)\s*```+/g, "$1");
  out = out.replace(/`([^`\n]+)`/g, "$1");

  // Negrito Markdown → negrito WhatsApp.
  out = out.replace(/\*\*([^\n*]+)\*\*/g, "*$1*");
  out = out.replace(/__([^\n_]+)__/g, "_$1_");

  // 2. Listas sempre com "- " no início da linha.
  out = out
    .split("\n")
    .map((line) => line.replace(/^\s*(?:[•·–—]|\*(?!\S)|\u2022)\s+/, "- ").replace(/\s+$/, ""))
    .join("\n");

  // Limpa marcadores soltos e linhas em branco a mais.
  out = out.replace(/\*{2,}/g, "*").replace(/\n{3,}/g, "\n\n");
  return out.trim();
}
