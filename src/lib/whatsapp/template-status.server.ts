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
  TEMPLATE_CHECKIN_V2,
  TEMPLATE_PLAN_ACTIVATED,
  TEMPLATE_PLAN_TRIAL_START,
  TEMPLATE_LANG,
} from "@/lib/assessor/proactive/templates";

export const TEMPLATES_APPROVED_FLAG = "whatsapp.templates.approved";

// Flag global de push proativo: continua a depender só dos dois templates
// do ciclo diário. O template de plano ativado é verificado à parte.
const REQUIRED_TEMPLATES = [TEMPLATE_MORNING, TEMPLATE_CHECKIN];
const TRACKED_TEMPLATES = [
  ...REQUIRED_TEMPLATES,
  TEMPLATE_CHECKIN_V2,
  TEMPLATE_PLAN_ACTIVATED,
  TEMPLATE_PLAN_TRIAL_START,
];

export const CHECKIN_V2_APPROVED_FLAG = "whatsapp.template.checkin_v2.approved";

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

/** Verifica se a versão corrigida do check-in já está aprovada. */
export async function isCheckinV2Approved(): Promise<boolean> {
  return isTemplateApproved(TEMPLATE_CHECKIN_V2);
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

  const checkinV2Approved = templates.some(
    (t) => t.name === TEMPLATE_CHECKIN_V2 && t.status === "APPROVED",
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

  // Regista separadamente se o v2 já pode ser usado.
  await supabase
    .from("feature_flags")
    .upsert({
      key: CHECKIN_V2_APPROVED_FLAG,
      enabled_globally: checkinV2Approved,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("key", CHECKIN_V2_APPROVED_FLAG);

  return { approved, changed: true, templates };
}

/**
 * Submete um template à Meta para aprovação.
 * Devolve o nome do template e o resultado bruto da Graph API.
 */
export async function submitTemplateToMeta(payload: {
  name: string;
  language?: string;
  category?: string;
  components: Array<Record<string, unknown>>;
}): Promise<{ ok: boolean; name: string; meta?: any; error?: string }> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  if (!token || !wabaId) {
    return { ok: false, name: payload.name, error: "Credenciais WhatsApp em falta" };
  }

  const url = `https://graph.facebook.com/v21.0/${wabaId}/message_templates`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: payload.name,
      language: payload.language ?? "pt_PT",
      category: payload.category ?? "UTILITY",
      components: payload.components,
    }),
  });

  const rawText = await res.text().catch(() => "");
  let json: any = {};
  try {
    json = rawText ? JSON.parse(rawText) : {};
  } catch {
    json = {};
  }

  if (!res.ok) {
    const err = json?.error ?? {};
    return {
      ok: false,
      name: payload.name,
      error: err.message ?? `HTTP ${res.status}`,
      meta: json,
    };
  }

  return { ok: true, name: payload.name, meta: json };
}

/** Submete a versão corrigida do check-in (v2) à Meta. */
export async function submitCheckinTemplateV2(): Promise<{
  ok: boolean;
  name: string;
  error?: string;
  meta?: any;
}> {
  return submitTemplateToMeta({
    name: TEMPLATE_CHECKIN_V2,
    language: TEMPLATE_LANG,
    category: "UTILITY",
    components: [
      {
        type: "BODY",
        text: "Como correu {{1}}? Toca num botão para registar o resultado.",
        example: {
          body_text: [["Visita ao apartamento da Rua Augusta"]],
        },
      },
      {
        type: "BUTTONS",
        buttons: [
          { type: "QUICK_REPLY", text: "Correu bem" },
          { type: "QUICK_REPLY", text: "Precisa seguimento" },
          { type: "QUICK_REPLY", text: "Sem efeito" },
        ],
      },
    ],
  });
}