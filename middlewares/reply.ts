import { AirtimePayError } from "./errors";

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  provider: string
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      // Don't retry client errors (4xx) — only network/server errors
      if (err instanceof AirtimePayError) {
        if (err.statusCode >= 400 && err.statusCode < 500) throw err;
      }
      if (attempt < maxRetries) {
        // Exponential backoff: 200ms, 400ms
        await sleep(200 * Math.pow(2, attempt));
      }
    }
  }

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}