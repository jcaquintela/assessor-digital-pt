import { it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "crypto";

const URL_BASE = "http://localhost:8080";
const PHONE = "351932893767";

function post(text: string, id: string) {
  const body = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{ id: "1", changes: [{ field: "messages", value: {
      messaging_product: "whatsapp",
      metadata: { display_phone_number: "1", phone_number_id: process.env["WHATSAPP_PHONE_NUMBER_ID"] },
      contacts: [{ profile: { name: "Julio" }, wa_id: PHONE }],
      messages: [{ from: PHONE, id, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: text } }],
    } }] }],
  });
  const sig = "sha256=" + createHmac("sha256", process.env["WHATSAPP_APP_SECRET"]!).update(body).digest("hex");
  return fetch(`${URL_BASE}/api/public/whatsapp-webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": sig },
    body,
  }).then(async (r) => console.log(id, r.status, await r.text()));
}

it("teste ao vivo", async () => {
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
  const supabase = createClient(process.env["SUPABASE_URL"]!, key, { auth: { persistSession: false } });
  const userId = "08d24695-a12c-4954-887a-81a71215a87e";
  const { TOOL_REGISTRY } = await import("./lib/assessor/v2/domain.server");
  const ctx = { supabase, userId, channel: "whatsapp" } as any;
  const created = await TOOL_REGISTRY["create_follow_up"]!(ctx, {
    title: "Compromisso de teste (validação de desmarcação)",
    type: "tarefa", due_date: "2026-08-05", due_time: "19:30", priority: "media",
  });
  console.log("CRIADO", JSON.stringify(created));

  const stamp = Date.now();
  const p1 = post("Limpa a minha agenda de hoje", `wamid.test.${stamp}.1`);
  await new Promise((r) => setTimeout(r, 3000));
  const p2 = post("Estou em viagem para Lisboa", `wamid.test.${stamp}.2`);
  await new Promise((r) => setTimeout(r, 3000));
  const p3 = post("Só volto às 18h", `wamid.test.${stamp}.3`);
  await Promise.all([p1, p2, p3]);
  await new Promise((r) => setTimeout(r, 20000));

  const { data } = await supabase.from("assessor_messages")
    .select("role, content, created_at").eq("user_id", userId).eq("channel", "whatsapp")
    .order("created_at", { ascending: false }).limit(10);
  console.log("TURNOS\n" + (data ?? []).reverse().map((m: any) => `[${m.created_at}] ${m.role}: ${m.content}`).join("\n"));
}, 180000);
