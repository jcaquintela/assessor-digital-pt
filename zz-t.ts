import { createClient } from "@supabase/supabase-js";
import { autoLinkAndSuggest, applyLinkSuggestion } from "/dev-server/src/lib/drive/link-suggestions.server";
import { listRelatedFiles } from "/dev-server/src/lib/drive/related-files.server";

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const { data: prof } = await sb.from("profiles").select("id").eq("email", "julio.quintela@saguii.com").maybeSingle();
const userId = (prof as any).id;
const tag = "ZZTEST" + Date.now();

const { data: person } = await sb.from("people").insert({ user_id: userId, name: `Mariana ${tag}` }).select("id").single();
const { data: prop } = await sb.from("properties").insert({ user_id: userId, title: `T3 Avenida ${tag}` }).select("id").single();
const { data: file, error: fErr } = await sb.from("uploaded_files").insert({
  user_id: userId, original_file_name: "escritura.pdf", internal_file_name: "escritura.pdf", channel: "whatsapp",
  extracted_text: `Escritura de compra e venda do imóvel T3 Avenida ${tag}, proprietária Mariana ${tag}, residente em Gaia.`,
}).select("id").single();
console.log("FERR", fErr);

const r = await autoLinkAndSuggest({ supabase: sb, userId, channel: "test", fileId: (file as any).id, fileLabel: "o documento" });
console.log("AUTO:", JSON.stringify(r, null, 2));

const { data: pending } = await sb.from("pending_actions").select("id, intent, status, structured_payload").eq("user_id", userId).eq("channel", "test").eq("intent", "suggest_file_link").order("created_at", { ascending: false }).limit(1);
console.log("PENDING:", JSON.stringify(pending, null, 2));

console.log("APPLY:", await applyLinkSuggestion(sb, userId, (pending as any)[0].structured_payload));

const { data: links } = await sb.from("file_links").select("entity_type, entity_id, source").eq("file_id", (file as any).id);
console.log("LINKS:", links);

console.log("FILES person:", JSON.stringify(await listRelatedFiles(sb, userId, "person", (person as any).id)));
console.log("FILES property:", JSON.stringify(await listRelatedFiles(sb, userId, "property", (prop as any).id)));

// limpeza
await sb.from("pending_actions").delete().eq("user_id", userId).eq("channel", "test");
await sb.from("file_links").delete().eq("file_id", (file as any).id);
await sb.from("uploaded_files").delete().eq("id", (file as any).id);
await sb.from("people").delete().eq("id", (person as any).id);
await sb.from("properties").delete().eq("id", (prop as any).id);
