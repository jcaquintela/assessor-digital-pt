// Armazenamento server-only das chaves de ligação por consultor/provider.
// Nunca devolver a chave ao browser.
import { encryptConnectionKey, decryptConnectionKey } from "./connection-key-crypto.server";
import type { CalendarProvider } from "./providers";

export async function saveConnectionKeyForUser(
  supabaseAdmin: any,
  userId: string,
  connectorId: string,
  connectionAPIKey: string,
) {
  const { error } = await supabaseAdmin.from("app_user_connections").upsert(
    {
      user_id: userId,
      connector_id: connectorId,
      connection_key_ciphertext: encryptConnectionKey(connectionAPIKey),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,connector_id" },
  );
  if (error) throw error;
}

export async function getConnectionKeyForUser(
  supabaseAdmin: any,
  userId: string,
  connectorId: string,
): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("app_user_connections")
    .select("connection_key_ciphertext")
    .eq("user_id", userId)
    .eq("connector_id", connectorId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  try {
    return decryptConnectionKey((data as any).connection_key_ciphertext);
  } catch {
    return null;
  }
}

export async function deleteConnectionForUser(
  supabaseAdmin: any,
  userId: string,
  connectorId: string,
) {
  await supabaseAdmin
    .from("app_user_connections")
    .delete()
    .eq("user_id", userId)
    .eq("connector_id", connectorId);
}

export async function listConnectedProviders(
  supabaseAdmin: any,
  userId: string,
): Promise<CalendarProvider[]> {
  const { data } = await supabaseAdmin
    .from("app_user_connections")
    .select("connector_id")
    .eq("user_id", userId);
  return ((data ?? []) as Array<{ connector_id: string }>)
    .map((r) => r.connector_id)
    .filter((c): c is CalendarProvider => c === "google_calendar" || c === "microsoft_outlook");
}