// Persistência do "último tópico de leitura" em `conversation_states`.
// Memória de conversa — nunca uma acção pendente de confirmação.

import { axisForTool, type LastReadState } from "./elliptic-read";

export async function recordLastRead(
  supabase: any,
  args: {
    userId: string;
    channel: string;
    tool: string;
    arguments?: Record<string, unknown> | null;
  },
): Promise<void> {
  try {
    await supabase.from("conversation_states").upsert(
      {
        user_id: args.userId,
        channel: args.channel,
        external_conversation_id: args.channel,
        last_read_tool: args.tool,
        last_read_args: args.arguments ?? {},
        last_read_axis: axisForTool(args.tool),
        last_read_at: new Date().toISOString(),
      } as never,
      { onConflict: "user_id,channel,external_conversation_id" },
    );
  } catch {
    /* noop — memória de conversa nunca bloqueia a resposta */
  }
}

export async function readLastRead(
  supabase: any,
  args: { userId: string; channel: string },
): Promise<LastReadState | null> {
  try {
    const { data } = await supabase
      .from("conversation_states")
      .select("last_read_tool, last_read_args, last_read_axis, last_read_at")
      .eq("user_id", args.userId)
      .eq("channel", args.channel)
      .maybeSingle();
    if (!data?.last_read_tool) return null;
    return {
      tool: data.last_read_tool ?? null,
      args: (data.last_read_args as Record<string, unknown> | null) ?? null,
      axis: data.last_read_axis ?? null,
      at: data.last_read_at ?? null,
    };
  } catch {
    return null;
  }
}
