import { createClient } from "@supabase/supabase-js";
import { handleDocumentRequest } from "./src/lib/drive/retrieve-channel.server";
import { resolveInteractiveReply } from "./src/lib/assessor/interactive";

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const userId = "08d24695-a12c-4954-887a-81a71215a87e";
const sent: any[] = [];
let lastPrompt: any = null;
const adapter: any = {
  channel: "telegram",
  async sendText(_t: string, t: string) { sent.push(["text", t]); return { ok: true }; },
  async sendInteractive(_to: string, p: any) { lastPrompt = p; sent.push(["interactive", p.kind, p.options.map((o:any)=>[o.label,o.description,Buffer.byteLength(o.id)])]); return { ok: true }; },
  async sendDocument(_to: string, d: any) { sent.push(["doc", d.fileName, d.bytes.length]); return { ok: true, messageId: "x" }; },
};
console.log("A>", await handleDocumentRequest(adapter, sb, { userId, to: "999", content: "manda-me um pdf" }));
const pick = resolveInteractiveReply(lastPrompt.options[1].id, "");
console.log("toque:", pick);
console.log("B>", await handleDocumentRequest(adapter, sb, { userId, to: "999", content: pick }));
console.log(JSON.stringify(sent, null, 1));
await sb.from("assessor_messages").delete().eq("user_id", userId).eq("sender_phone", "999");
await sb.from("pending_actions").delete().eq("user_id", userId).eq("intent", "choosing_document");
