// Interface única de envio de email da aplicação.
//
// COMO LIGAR UM PROVIDER REAL (quando for decidido):
// 1. Criar o adapter concreto em `src/lib/email/<provider>-adapter.server.ts`,
//    exportando um objecto que satisfaça `EmailProvider`.
// 2. Guardar a chave do provider como secret com o nome `EMAIL_PROVIDER_API_KEY`
//    (ler sempre dentro do `send()`, nunca no topo do módulo).
// 3. Em `getEmailProvider()` abaixo, devolver esse adapter quando
//    `process.env.EMAIL_PROVIDER_API_KEY` existir; caso contrário manter o
//    `nullEmailProvider`.
// Nada mais precisa de mudar: a UI de Comunicação, os segmentos e o histórico
// já falam apenas com esta interface.

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

export function getEmailProvider(): EmailProvider {
  // Passo 3 do comentário acima entra aqui.
  return nullEmailProvider;
}

export function isEmailProviderConfigured(): boolean {
  return getEmailProvider().name !== "null";
}