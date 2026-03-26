export type AirtimeErrorCode =
  | "INVALID_CREDENTIALS"
  | "INSUFFICIENT_BALANCE"
  | "INVALID_PHONE"
  | "TRANSACTION_NOT_FOUND"
  | "DUPLICATE_TRANSACTION"
  | "PROVIDER_ERROR"
  | "NETWORK_ERROR"
  | "TIMEOUT"
  | "UNSUPPORTED_OPERATION"
  | "INVALID_AMOUNT"
  | "INVALID_CURRENCY"
  | "REFUND_NOT_ALLOWED";

export class AirtimePayError extends Error {
  readonly code: AirtimeErrorCode;
  readonly provider: string;
  readonly statusCode: number;
  readonly raw?: unknown;

  constructor(opts: {
    code: AirtimeErrorCode;
    message: string;
    provider: string;
    statusCode?: number;
    raw?: unknown;
  }) {
    super(opts.message);
    this.name = "AirtimePayError";
    this.code = opts.code;
    this.provider = opts.provider;
    this.statusCode = opts.statusCode ?? 400;
    this.raw = opts.raw;
  }
}

export function providerError(
  provider: string,
  code: AirtimeErrorCode,
  message: string,
  statusCode = 400,
  raw?: unknown
): never {
  throw new AirtimePayError({ code, message, provider, statusCode, raw });
}