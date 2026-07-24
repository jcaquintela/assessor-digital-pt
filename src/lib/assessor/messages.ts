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
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as MensagemDb[];
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
  const { error } = await supabase.from("assessor_messages").update(patch as never).eq("id", id);
  if (error) throw error;
}

export async function clearMessages() {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("Sessão expirada.");
  const { error } = await supabase.from("assessor_messages").delete().eq("user_id", userData.user.id);
  if (error) throw error;
}