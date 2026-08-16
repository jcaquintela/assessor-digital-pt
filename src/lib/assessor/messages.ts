import { supabase } from "@/integrations/supabase/client";

export type CartaoTipo = "conversa" | "seguimento" | "despesa" | "comissao" | "briefing" | "procura";
export type EstadoCartao = "draft" | "confirmed" | "cancelled";

export interface MensagemDb {
  id: string;
  role: "user" | "assessor";
  content: string;
  message_type: CartaoTipo | null;
  structured_payload: Record<string, unknown> | null;
  status: EstadoCartao | null;
  created_at: string;
}

export async function loadMessages(limit = 80): Promise<MensagemDb[]> {
  const { data, error } = await supabase
    .from("assessor_messages")
    .select("*")
    // Conversa em bruto arquivada pela retenção de 3 semanas fica invisível.
    .is("archived_at", null)
    // Pedimos SEMPRE as mais recentes. Com ordem ascendente + limite, quem
    // tinha mais mensagens do que o limite recebia as MAIS ANTIGAS e nunca
    // via as respostas novas — a conversa parecia morta.
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  // Devolvemos por ordem cronológica, como a conversa se lê.
  return ((data ?? []) as unknown as MensagemDb[]).slice().reverse();
}

export async function saveMessage(m: {
  role: "user" | "assessor";
  content: string;
  message_type?: CartaoTipo | null;
  structured_payload?: Record<string, unknown> | null;
  status?: EstadoCartao | null;
}): Promise<MensagemDb> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("Sessão expirada.");
  const { data, error } = await supabase
    .from("assessor_messages")
    .insert({
      user_id: userData.user.id,
      role: m.role,
      content: m.content,
      message_type: m.message_type ?? null,
      structured_payload: (m.structured_payload ?? null) as never,
      status: m.status ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as unknown as MensagemDb;
}

export async function updateMessageStatus(
  id: string,
  status: EstadoCartao,
  payload?: Record<string, unknown>,
) {
  const patch: Record<string, unknown> = { status };
  if (payload) patch.structured_payload = payload;
  // SEGURANÇA MULTI-TENANT
  // Este UPDATE não filtra por user_id. Só é seguro porque corre no cliente
  // browser autenticado (`@/integrations/supabase/client`) e a RLS de
  // assessor_messages (`auth.uid() = user_id`) rejeita linhas de outros
  // donos. Se migrares este código para supabaseAdmin ou para um contexto
  // que ignore RLS (edge function, cron, back-office), adiciona
  // `.eq("user_id", <resolvedUserId>)` — caso contrário passa a permitir
  // alterar mensagens de qualquer utilizador.
  const { error } = await supabase.from("assessor_messages").update(patch as never).eq("id", id);
  if (error) throw error;
}

export async function clearMessages() {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("Sessão expirada.");
  const { error } = await supabase.from("assessor_messages").delete().eq("user_id", userData.user.id);
  if (error) throw error;
}