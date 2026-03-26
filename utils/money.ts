/**
 * Formats an MKW amount in tambala (smallest unit) to a human-readable string.
 * 250000 tambala → "MK 2,500.00"
 */
export function formatMKW(tambala: number): string {
  const kwacha = tambala / 100;
  return `MK ${kwacha.toLocaleString("en-MW", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Convert kwacha float → tambala integer (safe) */
export function toTambala(kwacha: number): number {
  return Math.round(kwacha * 100);
}

/** Convert tambala → kwacha float */
export function toKwacha(tambala: number): number {
  return tambala / 100;
}

export function assertPositiveAmount(amount: number, provider: string): void {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error(
      `[${provider}] Amount must be a positive integer in tambala. Got: ${amount}`
    );
  }
}