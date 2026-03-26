/**
 * Normalizes Malawian phone numbers to E.164 format (+265XXXXXXXXX)
 *
 * Accepts:
 *   0888123456    → +265888123456   (Airtel)
 *   0999123456    → +265999123456   (TNM)
 *   265888123456  → +265888123456
 *   +265888123456 → +265888123456
 */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");

  if (digits.startsWith("265") && digits.length === 12) {
    return `+${digits}`;
  }
  if (digits.startsWith("0") && digits.length === 10) {
    return `+265${digits.slice(1)}`;
  }
  if (digits.length === 9) {
    return `+265${digits}`;
  }

  throw new Error(`Invalid Malawian phone number: "${phone}"`);
}

export type MalawianNetwork = "airtel" | "tnm" | "unknown";

/**
 * Detects network from prefix
 * Airtel: 088x, 077x, 078x
 * TNM:    099x, 084x
 */
export function detectNetwork(phone: string): MalawianNetwork {
  const normalized = normalizePhone(phone);
  const local = normalized.slice(4); // strip +265

  if (/^(88|77|78)/.test(local)) return "airtel";
  if (/^(99|84)/.test(local)) return "tnm";
  return "unknown";
}