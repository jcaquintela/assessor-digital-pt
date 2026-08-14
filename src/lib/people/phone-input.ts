// Validação de números de telefone escritos à mão pelo consultor.
// Regra: normalizar sempre antes de validar — espaços, hífens, pontos e
// parênteses são formatação visual, nunca motivo para rejeitar um número.

export const PHONE_INVALID_MESSAGE =
  "Isso não parece um número de telefone válido — tens o indicativo e todos os dígitos?";

/** Remove tudo o que é formatação visual, mantendo dígitos e um '+' inicial. */
export function normalizePhoneInput(input: string | null | undefined): string {
  const raw = (input ?? "").toString().trim();
  if (!raw) return "";
  const plus = raw.startsWith("+") || raw.startsWith("00");
  const digits = raw.replace(/\D+/g, "").replace(/^00/, "");
  if (!digits) return "";
  return plus ? `+${digits}` : digits;
}

/** Número nacional PT: 9 dígitos começados por 9 (móvel) ou 2/3 (fixo). */
function isPtNational(digits: string): boolean {
  return /^[923]\d{8}$/.test(digits);
}

export interface PhoneClassification {
  /** true quando o texto tem cara de tentativa de número (só dígitos/formatação). */
  isPhoneAttempt: boolean;
  valid: boolean;
  /** E.164 quando conseguimos determinar o país (PT por defeito). */
  e164: string | null;
  message: string | null;
}

export function classifyPhoneInput(input: string | null | undefined): PhoneClassification {
  const raw = (input ?? "").toString().trim();
  const invalid = (attempt: boolean): PhoneClassification => ({
    isPhoneAttempt: attempt,
    valid: false,
    e164: null,
    message: attempt ? PHONE_INVALID_MESSAGE : null,
  });

  // Só consideramos tentativa de número se o texto for exclusivamente
  // dígitos e formatação telefónica (espaços, hífens, pontos, parênteses, +).
  if (!raw || !/^[+()\d\s.\-/]{4,24}$/.test(raw)) return invalid(false);
  const norm = normalizePhoneInput(raw);
  const digits = norm.replace(/^\+/, "");
  if (!digits) return invalid(false);

  if (norm.startsWith("+")) {
    if (digits.startsWith("351")) {
      const local = digits.slice(3);
      return isPtNational(local)
        ? { isPhoneAttempt: true, valid: true, e164: `+351${local}`, message: null }
        : invalid(true);
    }
    // Outro país: aceitamos 8 a 15 dígitos (E.164).
    return digits.length >= 8 && digits.length <= 15
      ? { isPhoneAttempt: true, valid: true, e164: `+${digits}`, message: null }
      : invalid(true);
  }

  if (isPtNational(digits)) {
    return { isPhoneAttempt: true, valid: true, e164: `+351${digits}`, message: null };
  }
  if (digits.startsWith("351") && isPtNational(digits.slice(3))) {
    return { isPhoneAttempt: true, valid: true, e164: `+351${digits.slice(3)}`, message: null };
  }
  return invalid(true);
}

/** Texto que o consultor claramente escreveu como número (válido ou não). */
export function looksLikePhoneAttempt(input: string | null | undefined): boolean {
  return classifyPhoneInput(input).isPhoneAttempt;
}

/** "932451222" → "932 451 222" (apresentação PT). */
export function formatPtPhone(input: string | null | undefined): string {
  const digits = normalizePhoneInput(input).replace(/^\+351/, "").replace(/^\+/, "");
  if (!isPtNational(digits)) return (input ?? "").toString().trim();
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
}
