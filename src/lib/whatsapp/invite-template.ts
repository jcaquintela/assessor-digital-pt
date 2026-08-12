// Convite de acesso enviado pelo próprio Afonso (WhatsApp).
//
// Um convite vai para quem ainda nunca falou connosco: não há janela de 24h
// aberta, por isso a Meta só deixa passar template aprovado. Texto livre é
// rejeitado com o código 131047.
//
// Template submetido à Meta (pt_PT, categoria MARKETING) — voz em primeira
// pessoa, porque quem envia é o próprio número do Afonso:
//   Nome:   afonso_convite_painel_v3
//   Corpo:  "Olá {{1}}, sou o Afonso. Toca no botão para finalizares o
//            registo no painel. Depois guarda o meu número e fala comigo
//            por aqui."
//   Botão:  URL dinâmica "https://app.meuafonso.com/entrar?token={{1}}"
//
// NOTA: a versão anterior (afonso_convite_painel) usava voz de terceira
// pessoa. A Meta trata qualquer alteração ao corpo de um template aprovado
// como nova submissão, por isso foi criado um template novo.
// A tentativa com 4 variáveis (link, número e código no corpo) foi rejeitada
// automaticamente pela Meta — corpos de convite com URL e código em texto
// caem na política de conteúdo. O link vive só no botão; o número e o código
// seguem em texto livre depois da janela de 24h abrir.

export const TEMPLATE_INVITE = "afonso_convite_painel_v3";
export const TEMPLATE_INVITE_LANG = "pt_PT";

/** Só enviamos para números plausíveis em E.164 (indicativo + 8 a 14 dígitos). */
export function isSendablePhone(digits: string | null | undefined): boolean {
  const d = String(digits ?? "").replace(/\D+/g, "");
  return d.length >= 9 && d.length <= 15 && !d.startsWith("0");
}

/** "+351 9XX XXX XXX" — confirma o destino sem expor o número inteiro. */
export function maskPhone(digits: string | null | undefined): string {
  const d = String(digits ?? "").replace(/\D+/g, "");
  if (!d) return "—";
  const cc = d.startsWith("351") ? "351" : d.slice(0, Math.max(1, d.length - 9));
  const rest = d.slice(cc.length);
  if (rest.length < 4) return `+${d}`;
  const head = rest.slice(0, 1);
  const tail = rest.slice(-3);
  const middle = "X".repeat(Math.max(0, rest.length - 4));
  const shown = `${head}${middle}${tail}`;
  const grouped = shown.replace(/(.{3})(?=.)/g, "$1 ");
  return `+${cc} ${grouped}`;
}

/** Token do link mágico (é ele que vai no botão do template). */
export function tokenFromUrl(url: string): string | null {
  const m = /[?&]token=([^&\s]+)/.exec(url ?? "");
  return m ? decodeURIComponent(m[1]!) : null;
}

export function inviteTemplatePayload(
  nome: string | null,
  url: string,
  _numeroAfonso?: string | null,
  _codigo?: string | null,
): Record<string, unknown> {
  const primeiro = (nome ?? "").trim().split(/\s+/)[0] || "Olá";
  const token = tokenFromUrl(url);
  return {
    type: "template",
    template: {
      name: TEMPLATE_INVITE,
      language: { code: TEMPLATE_INVITE_LANG },
      components: [
        {
          type: "body",
          parameters: [{ type: "text", text: primeiro }],
        },
        { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: token ?? "" }] },
      ],
    },
  };
}

/** Motivo legível para o admin a partir do erro cru da Meta. */
export function readableSendError(input: {
  errorCode?: number | null;
  errorMessage?: string | null;
} | null | undefined): string {
  const code = input?.errorCode ?? null;
  const raw = (input?.errorMessage ?? "").trim();
  if (code === 131047) {
    return "A Meta recusou: passaram mais de 24h sem mensagem deste número, só passa template aprovado.";
  }
  if (code === 131026) return "A Meta recusou: este número não tem WhatsApp.";
  if (code === 131008 || code === 132000) return "A Meta recusou: os dados do template não batem certo.";
  if (code === 132001) return "A Meta recusou: o template de convite ainda não está aprovado.";
  if (code === 131030) return "A Meta recusou: número fora da lista de destinatários de teste.";
  if (code === 190 || code === 102) return "A ligação à Meta expirou (credenciais). Avisa o suporte técnico.";
  return raw ? `A Meta recusou: ${raw}` : "A Meta não aceitou a mensagem.";
}
