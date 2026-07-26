// Utilidades partilhadas para o nome personalizado do Assessor.
// Regras: só personalização visual/conversacional. Nunca pode alterar
// permissões, regras de segurança ou o comportamento do sistema.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const ASSESSOR_NAME_DEFAULT = "Assessor";
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

// Remove o vocativo do assessor no início da frase, se presente.
// Ex.: "Maria, o que tenho hoje?" -> "o que tenho hoje?"
export function stripAssessorVocative(text: string, name: string | null | undefined): string {
  if (!text) return text;
  const n = sanitizeAssessorName(name ?? "");
  if (!n || n.toLowerCase() === ASSESSOR_NAME_DEFAULT.toLowerCase()) return text;
  const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^\\s*${escaped}\\s*[,:;!\\.\\-–—]+\\s*`, "iu");
  return text.replace(re, "").trim() || text;
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