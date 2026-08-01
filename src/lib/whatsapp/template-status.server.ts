// Verificação do estado dos templates WhatsApp na Meta.
//
// A Meta demora a aprovar templates. Em vez de esperarmos por uma acção
// manual, uma corrida periódica pergunta o estado à Graph API e, quando os
// dois templates estiverem APPROVED, liga sozinha a feature flag
// `whatsapp.templates.approved` — é essa flag que autoriza push fora da
// janela de 24h. Se algum template for rejeitado ou desactivado, a flag
// volta a desligar-se.

import {
  TEMPLATE_MORNING,
  TEMPLATE_CHECKIN,
  TEMPLATE_PLAN_ACTIVATED,
} from "@/lib/assessor/proactive/templates";

export const TEMPLATES_APPROVED_FLAG = "whatsapp.templates.approved";

// Flag global de push proativo: continua a depender só dos dois templates
// do ciclo diário. O template de plano ativado é verificado à parte.
const REQUIRED_TEMPLATES = [TEMPLATE_MORNING, TEMPLATE_CHECKIN];
const TRACKED_TEMPLATES = [...REQUIRED_TEMPLATES, TEMPLATE_PLAN_ACTIVATED];

export interface TemplateStatus {
  name: string;
  status: string;
  language: string | null;
}

/** Estado actual dos nossos templates na conta WhatsApp Business. */
export async function fetchTemplateStatuses(): Promise<TemplateStatus[]> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  if (!token || !wabaId) return [];

  const url = new URL(`https://graph.facebook.com/v21.0/${wabaId}/message_templates`);
  url.searchParams.set("fields", "name,status,language");
  url.searchParams.set("limit", "100");

  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return [];
  const json = (await res.json().catch(() => ({}))) as { data?: any[] };
  return ((json.data ?? []) as any[])
    .filter((t) => TRACKED_TEMPLATES.includes(String(t?.name ?? "")))
    .map((t) => ({
      name: String(t.name),
      status: String(t.status ?? "UNKNOWN").toUpperCase(),
      language: t.language ?? null,
    }));
}

/** Estado de um template concreto na Meta (ex.: afonso_plano_ativado). */
export async function isTemplateApproved(name: string): Promise<boolean> {
  const all = await fetchTemplateStatuses();
  return all.some((t) => t.name === name && t.status === "APPROVED");
}

/** Liga/desliga a flag conforme o estado na Meta. Devolve o que ficou. */
export async function syncTemplateApproval(
  supabase: any,
): Promise<{ approved: boolean; changed: boolean; templates: TemplateStatus[] }> {
  const templates = await fetchTemplateStatuses();
  const approved =
    REQUIRED_TEMPLATES.every((name) =>
      templates.some((t) => t.name === name && t.status === "APPROVED"),
    );

  const { data: current } = await supabase
    .from("feature_flags")
    .select("enabled_globally")
    .eq("key", TEMPLATES_APPROVED_FLAG)
    .maybeSingle();

  const was = Boolean((current as any)?.enabled_globally);
  if (was === approved) return { approved, changed: false, templates };

  await supabase
    .from("feature_flags")
    .update({ enabled_globally: approved, updated_at: new Date().toISOString() } as never)
    .eq("key", TEMPLATES_APPROVED_FLAG);

  return { approved, changed: true, templates };
}