// Comandos de barra ("/ajuda", "/start", ...).
//
// Regra de confiança: uma mensagem que começa por "/" é sempre um comando.
// Ou é reconhecido e executado, ou dizemos claramente que não é reconhecido.
// Nunca uma resposta genérica ("Estou aqui, Julio.") que parece bem-sucedida
// sem ter feito nada.
//
// Módulo puro: sem I/O. O caller decide o que fazer com o resultado.

export type CommandResult =
  | { kind: "none" }
  // Responder já com este texto, sem passar pelo motor.
  | { kind: "reply"; reply: string; command: string }
  // Comando conhecido que equivale a uma frase normal: reescreve e segue.
  | { kind: "rewrite"; content: string; command: string }
  | { kind: "unknown"; command: string; reply: string };

export const UNKNOWN_COMMAND_REPLY =
  "Não reconheço esse comando. Podes escrever normalmente ou usar /ajuda para ver o que sei fazer.";

export const HELP_REPLY = [
  "Fala comigo como falarias com um colega — não precisas de comandos.",
  "",
  "Se preferires atalhos:",
  "• /ajuda — esta lista",
  "• /novidades — o que aprendi de novo",
  "• /entrar — link para abrires o painel",
  "",
  "No dia-a-dia: conta-me visitas, pessoas e imóveis, pede-me a agenda, ou manda-me uma foto, um documento ou um áudio.",
].join("\n");

// "/comando", "/comando@bot", "/comando argumentos"
const COMMAND_RE = /^\/([\p{L}\d_]+)(?:@[\w_]+)?(?:\s+([\s\S]*))?$/u;

export function parseCommand(text: string | null | undefined): { name: string; args: string } | null {
  const m = (text ?? "").trim().match(COMMAND_RE);
  if (!m) return null;
  return { name: m[1].toLowerCase(), args: (m[2] ?? "").trim() };
}

export function isCommand(text: string | null | undefined): boolean {
  return parseCommand(text) !== null;
}

export function resolveCommand(text: string | null | undefined): CommandResult {
  const parsed = parseCommand(text);
  if (!parsed) return { kind: "none" };
  const { name } = parsed;

  switch (name) {
    case "ajuda":
    case "help":
    case "comandos":
    case "start":
      return { kind: "reply", reply: HELP_REPLY, command: name };
    case "novidades":
    case "novo_no_afonso":
      return { kind: "rewrite", content: "O que há de novo?", command: name };
    case "agenda":
    case "hoje":
      return { kind: "rewrite", content: "O que tenho hoje?", command: name };
    case "entrar":
    case "login":
    case "painel":
      return { kind: "rewrite", content: "entrar", command: name };
    default:
      return { kind: "unknown", command: name, reply: UNKNOWN_COMMAND_REPLY };
  }
}