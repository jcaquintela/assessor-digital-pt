// Normalize a phone number to E.164 digits-only form (no leading +).
// Meta sends `from` already as digits like "351912345678"; profiles.phone
// may include spaces, +, or dashes. Strip everything but digits.
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const digits = input.replace(/\D+/g, "");
  return digits.length >= 6 ? digits : null;
}