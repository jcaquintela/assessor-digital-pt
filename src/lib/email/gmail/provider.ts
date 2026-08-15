// Configuração do conector Gmail (App User Connector, ligação por consultor).
// Ficheiro seguro para o browser: só nomes, labels e scopes.
//
// Decisão de produto (15/08): o Afonso lê e prepara rascunhos, nunca envia
// sozinho. Por isso NÃO pedimos `gmail.send` — só `readonly` + `compose`.
// Nota: no Google, readonly e compose são ambos scopes "restricted"; ficamos
// em modo Teste (até 100 test users) enquanto o conceito é validado.

export const GMAIL_CONNECTOR_ID = "google_mail";

export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
];

export const GMAIL_CLIENT_KEY_ENV = "GOOGLE_MAIL_APP_USER_CONNECTOR_CLIENT_API_KEY";

export const GMAIL_RETURN_PATH = "/oauth/gmail/return";

export const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";

export const GMAIL_API_BASE = "/gmail/v1";

/** Em modo Teste do Google o refresh token deixa de funcionar ao fim de 7 dias. */
export const GMAIL_TEST_MODE_TOKEN_DAYS = 7;