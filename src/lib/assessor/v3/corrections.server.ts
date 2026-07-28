// Detecta correções do consultor após uma resposta do Assessor.
// Se a mensagem do turno actual segue < 90 s uma resposta assistente e
// contém padrões de correção, classifica e persiste em `assistant_user_corrections`.
//
// Categorias fechadas — ver enum `assistant_correction_category`.

import { callGateway, V2_MODEL_DEFAULT } from "../v2/gateway.server";

export const CORRECTION_HINT_RE =
  /(?:^|\W)(n[ãa]o\s+[eé]|n[ãa]o\s+era|errado|erraste|queria\s+dizer|esse\s+n[ãa]o|essa\s+n[ãa]o|n[ãa]o\s+hoje|n[ãa]o\s+amanh[ãa]|mudei\s+de\s+ideias|apaga|cancela|desmarca|corrige|troca|substitui|ali[áa]s|n[ãa]o\s+quero)(?:$|\W)/i;

export type CorrectionCategory =
  | "wrong_person" | "wrong_property" | "wrong_date" | "wrong_document"
  | "lost_context" | "unnatural_reply" | "unnecessary_question"
  | "wrong_execution" | "other";

export interface CorrectionRecord {
  id: string;
  category: CorrectionCategory;
}

export function looksLikeCorrection(
  message: string,
  lastAssistantAt: Date | null,
  now: Date = new Date(),
): boolean {
  if (!lastAssistantAt) return false;
  const dt = now.getTime() - lastAssistantAt.getTime();
  if (dt > 90_000 || dt < 0) return false;
  return CORRECTION_HINT_RE.test(message);
}

const CATEGORY_SYSTEM = `Classificas correções feitas por um consultor imobiliário PT ao seu Assessor.
Categorias permitidas (devolve exactamente uma):
wrong_person | wrong_property | wrong_date | wrong_document | lost_context | unnatural_reply | unnecessary_question | wrong_execution | other
Devolves apenas JSON: {"category":"..."}. Sem texto extra.`;

async function classifyCorrection(
  originalAssistantReply: string,
  correctionMessage: string,
): Promise<CorrectionCategory> {
  try {
    const call = await callGateway({
      model: V2_MODEL_DEFAULT,
      messages: [
        { role: "system", content: CATEGORY_SYSTEM },
        { role: "user", content: JSON.stringify({ assistant: originalAssistantReply, correction: correctionMessage }) },
      ],
      temperature: 0,
      maxTokens: 40,
      responseFormat: { type: "json_object" },
    });
    const raw = call.message?.content ?? "";
    const parsed = JSON.parse((raw.match(/\{[\s\S]*\}/) ?? [raw])[0]);
    const cat = String(parsed?.category ?? "other");
    const allowed: CorrectionCategory[] = [
      "wrong_person","wrong_property","wrong_date","wrong_document",
      "lost_context","unnatural_reply","unnecessary_question","wrong_execution","other",
    ];
    return (allowed as string[]).includes(cat) ? (cat as CorrectionCategory) : "other";
  } catch {
    return "other";
  }
}

export async function captureCorrection(
  supabase: any,
  input: {
    userId: string;
    channel: string;
    conversationId: string | null;
    previousTraceId: string | null;
    originalAssistantReply: string;
    correctionMessage: string;
  },
): Promise<CorrectionRecord | null> {
  const category = await classifyCorrection(input.originalAssistantReply, input.correctionMessage);
  try {
    const { data } = await supabase.from("assistant_user_corrections").insert({
      user_id: input.userId,
      channel: input.channel,
      conversation_id: input.conversationId,
      turn_id: input.previousTraceId,
      category,
      original_message: input.originalAssistantReply,
      correction_message: input.correctionMessage,
      resolved: false,
    } as never).select("id").maybeSingle();
    return { id: (data as any)?.id ?? "", category };
  } catch {
    return null;
  }
}