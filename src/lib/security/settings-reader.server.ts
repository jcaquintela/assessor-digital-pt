// Leitura de definições internas (feature_flags, app_settings).
// Estas tabelas só são legíveis pela equipa; o servidor lê-as com o cliente
// privilegiado, sem expor o conteúdo aos consultores.
export async function settingsClient(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}
