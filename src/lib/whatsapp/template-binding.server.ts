// Escolha do template aprovado usado em cada mensagem proativa.
//
// A Meta aprova templates com o nome que quiser (e podemos submeter várias
// versões). Em vez de fixar o nome no código, o admin escolhe — na página
// Integrações & flags — qual dos templates APPROVED da conta é usado em cada
// finalidade. Sem escolha activa, o envio fora das 24h fica em silêncio.

import { TEMPLATE_LANG } from "@/lib/assessor/proactive/templates";

export type TemplatePurpose = "meeting_briefing";

export interface TemplateBinding {
  purpose: TemplatePurpose;
  template_name: string;
  language: string;
  param_count: number;
  enabled: boolean;
  updated_at?: string | null;
  /** Categoria na Meta (utility/marketing/...): define o preço fora das 24h. */
  category?: string | null;
}

export interface MetaTemplate {
  name: string;
  status: string;
  language: string;
  category: string | null;
  body: string;
  paramCount: number;
}

function countParams(body: string): number {
  const found = new Set<number>();
  for (const m of body.matchAll(/\{\{(\d+)\}\}/g)) found.add(Number(m[1]));
  return found.size ? Math.max(...found) : 0;
}

/** Todos os templates da conta WhatsApp Business (não só os nossos). */
export async function listMetaTemplates(): Promise<MetaTemplate[]> {
  const token = process.env['WHATSAPP_ACCESS_TOKEN'];
  const wabaId = process.env['WHATSAPP_BUSINESS_ACCOUNT_ID'];
  if (!token || !wabaId) return [];

  const url = new URL(`https://graph.facebook.com/v21.0/${wabaId}/message_templates`);
  url.searchParams.set("fields", "name,status,language,category,components");
  url.searchParams.set("limit", "200");
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return [];
  const json = (await res.json().catch(() => ({}))) as { data?: any[] };
  return ((json.data ?? []) as any[]).map((t) => {
    const body = String(
      (t?.components ?? []).find((c: any) => String(c?.type).toUpperCase() === "BODY")?.text ?? "",
    );
    return {
      name: String(t?.name ?? ""),
      status: String(t?.status ?? "UNKNOWN").toUpperCase(),
      language: String(t?.language ?? TEMPLATE_LANG),
      category: t?.category ? String(t.category) : null,
      body,
      paramCount: countParams(body),
    };
  });
}

export async function getTemplateBinding(
  supabase: any,
  purpose: TemplatePurpose,
): Promise<TemplateBinding | null> {
  const { data } = await supabase
    .from("whatsapp_template_bindings")
    .select("purpose, template_name, language, param_count, enabled, updated_at")
    .eq("purpose", purpose)
    .maybeSingle();
  return (data as TemplateBinding) ?? null;
}

export async function setTemplateBinding(
  supabase: any,
  input: TemplateBinding & { updated_by?: string | null },
): Promise<TemplateBinding> {
  const row = {
    purpose: input.purpose,
    template_name: input.template_name,
    language: input.language || TEMPLATE_LANG,
    param_count: Math.max(0, Math.min(10, input.param_count ?? 3)),
    enabled: !!input.enabled,
    updated_by: input.updated_by ?? null,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from("whatsapp_template_bindings")
    .upsert(row, { onConflict: "purpose" })
    .select("purpose, template_name, language, param_count, enabled, updated_at")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as TemplateBinding;
}

/**
 * Binding utilizável: existe, está ligado e o template continua APPROVED na
 * Meta. Devolve null (silêncio) em qualquer outro caso.
 */
export async function resolveUsableBinding(
  supabase: any,
  purpose: TemplatePurpose,
): Promise<TemplateBinding | null> {
  const binding = await getTemplateBinding(supabase, purpose);
  if (!binding?.enabled || !binding.template_name) return null;
  const all = await listMetaTemplates();
  const match = all.find(
    (t) => t.name === binding.template_name && t.status === "APPROVED",
  );
  if (!match) return null;
  return {
    ...binding,
    param_count: match.paramCount || binding.param_count,
    category: match.category ?? null,
  };
}
