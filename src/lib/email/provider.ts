// Interface única de envio de email da aplicação.
//
// PROVIDER ACTUAL: Resend (`src/lib/email/resend-adapter.server.ts`).
// A chave vive na secret `EMAIL_PROVIDER_API_KEY` e é lida dentro do `send()`,
// nunca no topo de um módulo. Sem chave, cai no `nullEmailProvider` e o envio
// fica bloqueado — nunca falha silenciosamente.
// Para trocar de provider basta criar outro `<provider>-adapter.server.ts` e
// mudar o import dinâmico em `getEmailProvider()`. A UI de Comunicação, os
// segmentos e o histórico falam apenas com esta interface.

export type EmailMessage = {
  to: string;
  subject: string;
  body: string;
};

export type EmailSendResult = {
  success: boolean;
  error?: string;
};

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<EmailSendResult>;
}

// Adapter "null": não envia nada. É o comportamento actual — o envio real
// fica bloqueado até existir um provider configurado.
export const nullEmailProvider: EmailProvider = {
  name: "null",
  async send() {
    return { success: false, error: "provider não configurado" };
  },
};

// Só pode ser chamado de código servidor (lê `process.env`). O import do
// adapter é dinâmico para o módulo `.server` nunca entrar no bundle do browser.
export async function getEmailProvider(): Promise<EmailProvider> {
  if (!process.env.EMAIL_PROVIDER_API_KEY) return nullEmailProvider;
  const { resendEmailProvider } = await import("./resend-adapter.server");
  return resendEmailProvider;
}

export function isEmailProviderConfigured(): boolean {
  return !!process.env.EMAIL_PROVIDER_API_KEY;
}