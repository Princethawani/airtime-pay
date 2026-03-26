// ─── Core types shared across the whole SDK ────────────────────────────────────

export type TransactionStatus =
  | "pending"
  | "processing"
  | "successful"
  | "failed"
  | "refunded"
  | "cancelled";

export type ProviderName = "airtel" | "mpamba" | "mock";

// ─── Payment ──────────────────────────────────────────────────────────────────

export interface PaymentRequest {
  /** Amount in tambala (smallest unit). MK 100 = 10000 tambala */
  amount: number;
  currency?: string;          // defaults to MWK
  phone: string;              // customer phone — any Malawian format accepted
  reference: string;          // your unique transaction reference
  description?: string;
  metadata?: Record<string, string>;
}

export interface PaymentResponse {
  transactionId: string;      // provider's transaction ID
  reference: string;          // your reference echoed back
  status: TransactionStatus;
  amount: number;             // in tambala
  currency: string;
  phone: string;              // normalized E.164
  provider: ProviderName;
  message: string;
  createdAt: number;          // unix timestamp
  raw?: unknown;              // full provider response (for debugging)
}

// ─── Balance ──────────────────────────────────────────────────────────────────

export interface BalanceResponse {
  balance: number;            // in tambala
  currency: string;
  provider: ProviderName;
  phone?: string;
  retrievedAt: number;
}

// ─── Transaction status ───────────────────────────────────────────────────────

export interface TransactionStatusResponse {
  transactionId: string;
  reference: string;
  status: TransactionStatus;
  amount: number;
  currency: string;
  phone: string;
  provider: ProviderName;
  updatedAt: number;
  raw?: unknown;
}

// ─── Refund ───────────────────────────────────────────────────────────────────

export interface RefundRequest {
  transactionId: string;
  amount?: number;            // partial refund in tambala; omit for full refund
  reason?: string;
}

export interface RefundResponse {
  refundId: string;
  transactionId: string;
  amount: number;
  currency: string;
  status: TransactionStatus;
  provider: ProviderName;
  createdAt: number;
}

// ─── Webhooks ─────────────────────────────────────────────────────────────────

export type WebhookEventType =
  | "payment.successful"
  | "payment.failed"
  | "payment.pending"
  | "refund.successful"
  | "refund.failed";

export interface WebhookEvent<T = unknown> {
  id: string;
  type: WebhookEventType;
  provider: ProviderName;
  data: T;
  createdAt: number;
}

export type WebhookHandler<T = unknown> = (event: WebhookEvent<T>) => void | Promise<void>;

// ─── Provider interface ───────────────────────────────────────────────────────

export interface MobileMoneyProvider {
  readonly name: ProviderName;

  pay(request: PaymentRequest): Promise<PaymentResponse>;
  balance(): Promise<BalanceResponse>;
  status(transactionId: string): Promise<TransactionStatusResponse>;
  refund(request: RefundRequest): Promise<RefundResponse>;
}