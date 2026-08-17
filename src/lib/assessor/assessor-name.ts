import { BRAND_NAME } from "@/lib/brand";
// Utilidades partilhadas para o nome personalizado do Assessor.
// Regras: só personalização visual/conversacional. Nunca pode alterar
// permissões, regras de segurança ou o comportamento do sistema.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const ASSESSOR_NAME_DEFAULT: string = BRAND_NAME;
export const ASSESSOR_NAME_MAX = 30;

// Letras (com acentos), espaços, hífenes e apóstrofos. Nada mais.
const ALLOWED = /^[\p{L}][\p{L}\s'’\-]*$/u;

// Lista curta de termos claramente ofensivos/injection. Não pretende ser
// exaustiva — reforça o disclaimer do prompt.
const BLOCKLIST = [
  /\bignore\b/i,
  /\bsystem\s*prompt\b/i,
  /\brole\s*[:=]/i,
  /\bassistant\s*[:=]/i,
  /https?:\/\//i,
  /<[^>]+>/, // qualquer tag HTML
  /[\x00-\x1F\x7F]/, // caracteres de controlo
];

export function sanitizeAssessorName(raw: string): string {
  return String(raw ?? "")
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim();
}

export interface AssessorNameValidation {
  ok: boolean;
  value: string;
  error?: string;
}

export function validateAssessorName(raw: string): AssessorNameValidation {
  const v = sanitizeAssessorName(raw);
  if (!v) return { ok: false, value: v, error: "O nome não pode estar vazio." };
  if (v.length > ASSESSOR_NAME_MAX) return { ok: false, value: v, error: `Máximo ${ASSESSOR_NAME_MAX} caracteres.` };
  if (!ALLOWED.test(v)) return { ok: false, value: v, error: "Usa apenas letras, espaços, hífenes e apóstrofos." };
  for (const re of BLOCKLIST) {
    if (re.test(v)) return { ok: false, value: v, error: "Este nome não é permitido." };
  }
  return { ok: true, value: v };
}

// Remove o vocativo do Assessor (início ou fim), sem apagar ocorrências
// que sejam claramente uma pessoa. Ex.:
//   "Maria, amanhã tenho visita com a Ana." -> "amanhã tenho visita com a Ana."
//   "O que tenho hoje, Maria?"              -> "O que tenho hoje"
//   "maria lembra-me de ligar ao João."     -> "lembra-me de ligar ao João."
//   "Ana, falei com a Ana Silva."           -> "falei com a Ana Silva."
//   "Amanhã tenho visita com a Maria Silva." (Assessor=Maria) -> inalterado
export function stripAssessorVocative(text: string, name: string | null | undefined): string {
  if (!text) return text;
  const n = sanitizeAssessorName(name ?? "");
  const isDefault = !n || n.toLowerCase() === ASSESSOR_NAME_DEFAULT.toLowerCase();
  const nameLit = isDefault ? ASSESSOR_NAME_DEFAULT : n;
  const escaped = nameLit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  let out = text;

  // 1) Vocativo no início com pontuação (ou saudação opcional antes):
  //    "Maria, ...", "Maria: ...", "Maria - ...", "Maria… ...", "Maria! ...",
  //    "Olá Maria, ...", "Meu Assessor, ..."
  const leadPunct = new RegExp(
    `^\\s*(?:ol[áa]|hey|oi|meu|minha|querid[ao])?\\s*${escaped}\\s*(?:[,:;!\\.\\-–—…]|\\.{2,}|—|–)+\\s*`,
    "iu",
  );
  // 2) Vocativo no início sem pontuação, seguido de palavra em minúsculas:
  //    "maria lembra-me de ligar ao João."
  const leadSpaceLower = new RegExp(`^\\s*${escaped}\\s+(?=\\p{Ll})`, "iu");

  if (leadPunct.test(out)) {
    out = out.replace(leadPunct, "");
  } else if (leadSpaceLower.test(out)) {
    // Só aplicamos o padrão sem pontuação se o Assessor tem nome próprio;
    // com o nome por defeito ("Assessor") a frase seria demasiado ambígua.
    if (!isDefault) out = out.replace(leadSpaceLower, "");
  }

  // 3) Vocativo no fim: precedido por pontuação de vocativo.
  //    "..., Maria?" | "... — Maria!" | "... … Maria"
  const tail = new RegExp(`[,;\\-–—…]\\s*${escaped}\\s*[.?!]*\\s*$`, "iu");
  out = out.replace(tail, "");

  // 4) Saudação + Assessor no fim, sem pontuação: "Olá Maria", "Bom dia Maria".
  //    Mantém a saudação, remove o nome do Assessor.
  const greetTail = new RegExp(
    `^(\\s*(?:ol[áa]|oi|hey|hello|hi|bom\\s+dia|boa\\s+tarde|boa\\s+noite))\\s+${escaped}\\s*[.?!]*\\s*$`,
    "iu",
  );
  if (greetTail.test(out)) out = out.replace(greetTail, "$1");

  return out.trim() || text;
}

// Hook para leitura do nome do Assessor do consultor autenticado.
export function useAssessorName(): { name: string; loading: boolean; reload: () => void } {
  const [name, setName] = useState<string>(ASSESSOR_NAME_DEFAULT);
  const [loading, setLoading] = useState<boolean>(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) { if (!cancelled) setLoading(false); return; }
      const { data } = await supabase
        .from("profiles")
        .select("assessor_name" as never)
        .eq("id", userData.user.id)
        .maybeSingle();
      if (cancelled) return;
      const nm = (data as { assessor_name?: string } | null)?.assessor_name;
      setName(sanitizeAssessorName(nm ?? "") || ASSESSOR_NAME_DEFAULT);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [nonce]);

  return { name, loading, reload: () => setNonce((n) => n + 1) };
}