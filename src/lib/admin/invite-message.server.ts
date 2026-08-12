// Mensagem única de convite: o consultor recebe tudo o que precisa para
// arrancar — o número do Afonso, o código de acesso e o link para finalizar
// o registo no painel. Um só WhatsApp/Telegram, sem passos soltos.
import { LOGIN_TOKEN_TTL_MIN, issueDashboardLoginLink } from "@/lib/auth/dashboard-login.server";
import { WHATSAPP_CODE_TTL_MIN, getDisplayNumber } from "@/lib/whatsapp/link.functions";

export type InvitePayload = {
  texto: string;
  url: string;
  codigo: string | null;
  numeroAfonso: string | null;
};

// Pré-visualização: mesma mensagem, sem emitir nada (sem link real, sem
// gastar código). O admin lê exatamente o que vai sair, por canal.
export type InvitePreview = InvitePayload & { placeholders: boolean };

function prettyNumber(digits: string | null): string | null {
  if (!digits) return null;
  return `+${digits}`;
}

// Um só sítio a escrever a mensagem — pré-visualização e envio nunca divergem.
export function formatInviteMessage(opts: {
  nome?: string | null;
  url: string;
  codigo: string | null;
  numeroAfonso: string | null;
}): string {
  const primeiroNome = (opts.nome ?? "").trim().split(/\s+/)[0] || "";
  const linhas: string[] = [
    primeiroNome ? `Olá ${primeiroNome}, bem-vindo ao Afonso.` : "Bem-vindo ao Afonso.",
    "",
    "1) Finaliza o registo no painel:",
    opts.url,
    `(válido ${LOGIN_TOKEN_TTL_MIN} minutos e só funciona uma vez)`,
  ];
  if (opts.numeroAfonso) {
    linhas.push("", `2) Guarda o meu número, é por aqui que vamos falar: ${opts.numeroAfonso}`);
  }
  if (opts.codigo) {
    linhas.push(
      "",
      `${opts.numeroAfonso ? "3" : "2"}) Manda-me este código de acesso na primeira mensagem: ${opts.codigo}`,
      `(válido ${WHATSAPP_CODE_TTL_MIN} minutos)`,
    );
  }
  linhas.push("", "Depois disso é só falares comigo como agora.");
  return linhas.join("\n");
}

export async function buildInvitePreview(opts: {
  canal: string;
  nome?: string | null;
  phone?: string | null;
}): Promise<InvitePreview> {
  const numeroAfonso = prettyNumber(await getDisplayNumber());
  const url = "https://app.meuafonso.com/entrar?token=…(gerado no envio)";
  const codigo = opts.canal === "whatsapp" && opts.phone ? "LIGAR-XXXX (gerado no envio)" : null;
  return {
    texto: formatInviteMessage({ nome: opts.nome, url, codigo, numeroAfonso }),
    url,
    codigo,
    numeroAfonso,
    placeholders: true,
  };
}

// Código de acesso: o consultor manda-o ao Afonso na primeira mensagem e o
// canal fica confirmado do lado dele (não depende de o admin ter acertado).
async function issueAccessCode(
  supabaseAdmin: any,
  userId: string,
  phone: string | null,
): Promise<string | null> {
  if (!phone) return null;
  const { generateLinkCode, hashLinkCode } = await import("@/lib/whatsapp/link-code.server");
  await supabaseAdmin
    .from("whatsapp_link_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("used_at", null);
  const code = generateLinkCode();
  const { error } = await supabaseAdmin.from("whatsapp_link_codes").insert({
    user_id: userId,
    phone,
    code_hash: hashLinkCode(code),
    expires_at: new Date(Date.now() + WHATSAPP_CODE_TTL_MIN * 60_000).toISOString(),
  });
  if (error) return null;
  return code;
}

export async function buildInviteMessage(
  supabaseAdmin: any,
  opts: {
    userId: string;
    canal: string;
    nome?: string | null;
    phone?: string | null;
    reason?: string | null;
    issuedBy?: string | null;
  },
): Promise<InvitePayload> {
  const { url } = await issueDashboardLoginLink(supabaseAdmin, opts.userId, opts.canal, {
    reason: opts.reason ?? "Convite de acesso enviado pela equipa.",
    issuedBy: opts.issuedBy ?? null,
  });

  const [codigo, numero] = await Promise.all([
    issueAccessCode(supabaseAdmin, opts.userId, opts.phone ?? null),
    getDisplayNumber(),
  ]);
  const numeroAfonso = prettyNumber(numero);

  return {
    texto: formatInviteMessage({ nome: opts.nome, url, codigo, numeroAfonso }),
    url,
    codigo,
    numeroAfonso,
  };
}
