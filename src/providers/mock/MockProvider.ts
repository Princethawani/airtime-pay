import type {
  MobileMoneyProvider,
  PaymentRequest,
  PaymentResponse,
  BalanceResponse,
  TransactionStatusResponse,
  RefundRequest,
  RefundResponse,
  TransactionStatus,
  WebhookEventType,
} from "../../payments/interface/types";
import type { MockConfig } from "../../../config";
import { AirtimePayError } from "../../../middlewares/errors";
import { normalizePhone } from "../../../utils/phone";
import { assertPositiveAmount } from "../../../utils/money";
import { generateTxId, now } from "../../../utils/idGenerator";

// ── Scenario types ─────────────────────────────────────────────────────────────

export type MockScenario =
  | "success"
  | "pending"
  | "failed"
  | "insufficientBalance"
  | "invalidPhone"
  | "timeout"
  | "networkError"
  | "duplicate";

export interface MockScenarioConfig {
  payment?: { status?: TransactionStatus; failWithCode?: string; failWithMessage?: string };
  balance?: { amount?: number };
}

// ── Stored transaction ────────────────────────────────────────────────────────

interface StoredTransaction {
  transactionId: string;
  reference: string;
  status: TransactionStatus;
  amount: number;
  currency: string;
  phone: string;
  createdAt: number;
}

// ── Webhook handler registry ──────────────────────────────────────────────────

type Handler = (event: any) => void;

/**
 * In-memory mock provider for unit testing.
 * No network calls. Full scenario control.
 *
 * @example
 * const mock = new MockProvider({ provider: "mock" });
 * mock.use("insufficientBalance");
 * await expect(mock.pay(req)).rejects.toMatchObject({ code: "INSUFFICIENT_BALANCE" });
 */
export class MockProvider implements MobileMoneyProvider {
  readonly name = "mock" as const;

  private scenario: MockScenario = "success";
  private customConfig: MockScenarioConfig | null = null;
  private transactions = new Map<string, StoredTransaction>();
  private refunds = new Map<string, RefundResponse>();
  private _balance = 50_000_00; // MK 500,000 in tambala
  private webhookHandlers = new Map<string, Handler[]>();
  private eventHistory: any[] = [];
  private currency: string;

  constructor(config: MockConfig = { provider: "mock" }) {
    this.currency = config.currency ?? "MWK";
  }

  // ── Scenario control ────────────────────────────────────────────────────────

  use(scenario: MockScenario): this {
    this.scenario = scenario;
    this.customConfig = null;
    return this;
  }

  useCustom(config: MockScenarioConfig): this {
    this.customConfig = config;
    return this;
  }

  setBalance(tambala: number): this {
    this._balance = tambala;
    return this;
  }

  reset(): this {
    this.scenario = "success";
    this.customConfig = null;
    this.transactions.clear();
    this.refunds.clear();
    this._balance = 50_000_00;
    this.webhookHandlers.clear();
    this.eventHistory = [];
    return this;
  }

  // ── MobileMoneyProvider implementation ─────────────────────────────────────

  async pay(request: PaymentRequest): Promise<PaymentResponse> {
    assertPositiveAmount(request.amount, this.name);
    const phone = this.parsePhone(request.phone);

    this.assertScenario(request);

    // Check for duplicate
    if (this.scenario === "duplicate") {
      throw new AirtimePayError({
        code: "DUPLICATE_TRANSACTION",
        message: `Duplicate transaction reference: ${request.reference}`,
        provider: this.name,
        statusCode: 409,
      });
    }

    const txId = generateTxId();
    const status = this.resolveStatus();

    const tx: StoredTransaction = {
      transactionId: txId,
      reference: request.reference,
      status,
      amount: request.amount,
      currency: this.currency,
      phone,
      createdAt: now(),
    };
    this.transactions.set(txId, tx);
    this.transactions.set(request.reference, tx); // index by reference too

    const response: PaymentResponse = {
      transactionId: txId,
      reference: request.reference,
      status,
      amount: request.amount,
      currency: this.currency,
      phone,
      provider: this.name,
      message: status === "successful" ? "Payment successful" : status === "pending" ? "Payment pending" : "Payment failed",
      createdAt: now(),
    };

    // Fire webhook
    const eventType: WebhookEventType =
      status === "successful" ? "payment.successful"
      : status === "pending" ? "payment.pending"
      : "payment.failed";
    this.fireEvent(eventType, response);

    return response;
  }

  async balance(): Promise<BalanceResponse> {
    return {
      balance: this._balance,
      currency: this.currency,
      provider: this.name,
      retrievedAt: now(),
    };
  }

  async status(transactionId: string): Promise<TransactionStatusResponse> {
    const tx = this.transactions.get(transactionId);
    if (!tx) {
      throw new AirtimePayError({
        code: "TRANSACTION_NOT_FOUND",
        message: `Transaction not found: ${transactionId}`,
        provider: this.name,
        statusCode: 404,
      });
    }
    return {
      transactionId: tx.transactionId,
      reference: tx.reference,
      status: tx.status,
      amount: tx.amount,
      currency: tx.currency,
      phone: tx.phone,
      provider: this.name,
      updatedAt: now(),
    };
  }

  async refund(request: RefundRequest): Promise<RefundResponse> {
    const tx = this.transactions.get(request.transactionId);
    if (!tx) {
      throw new AirtimePayError({
        code: "TRANSACTION_NOT_FOUND",
        message: `Transaction not found: ${request.transactionId}`,
        provider: this.name,
        statusCode: 404,
      });
    }

    if (tx.status !== "successful") {
      throw new AirtimePayError({
        code: "REFUND_NOT_ALLOWED",
        message: `Cannot refund a transaction with status: ${tx.status}`,
        provider: this.name,
        statusCode: 400,
      });
    }

    const refundAmount = request.amount ?? tx.amount;
    if (refundAmount > tx.amount) {
      throw new AirtimePayError({
        code: "INVALID_AMOUNT",
        message: "Refund amount exceeds original transaction amount",
        provider: this.name,
        statusCode: 400,
      });
    }

    const refundId = generateTxId();
    const refund: RefundResponse = {
      refundId,
      transactionId: request.transactionId,
      amount: refundAmount,
      currency: this.currency,
      status: "successful",
      provider: this.name,
      createdAt: now(),
    };
    this.refunds.set(refundId, refund);

    // Mark transaction as refunded
    this.transactions.set(tx.transactionId, { ...tx, status: "refunded" });
    this.fireEvent("refund.successful", refund);
    return refund;
  }

  // ── Webhook support ─────────────────────────────────────────────────────────

  on(type: WebhookEventType | WebhookEventType[], handler: Handler): this {
    const types = Array.isArray(type) ? type : [type];
    for (const t of types) {
      this.webhookHandlers.set(t, [...(this.webhookHandlers.get(t) ?? []), handler]);
    }
    return this;
  }

  getEventHistory(): any[] { return [...this.eventHistory]; }
  clearHistory(): this { this.eventHistory = []; return this; }

  // ── Inspection helpers for tests ────────────────────────────────────────────

  getTransaction(idOrRef: string): StoredTransaction | undefined {
    return this.transactions.get(idOrRef);
  }

  getAllTransactions(): StoredTransaction[] {
    // Deduplicate (stored twice by id and reference)
    const seen = new Set<string>();
    return Array.from(this.transactions.values()).filter((tx) => {
      if (seen.has(tx.transactionId)) return false;
      seen.add(tx.transactionId);
      return true;
    });
  }

  // ── Internals ───────────────────────────────────────────────────────────────

  private assertScenario(request: PaymentRequest): void {
    if (this.scenario === "networkError") {
      throw new AirtimePayError({
        code: "NETWORK_ERROR",
        message: "Simulated network error",
        provider: this.name,
        statusCode: 503,
      });
    }
    if (this.scenario === "timeout") {
      throw new AirtimePayError({
        code: "TIMEOUT",
        message: "Simulated timeout",
        provider: this.name,
        statusCode: 408,
      });
    }
    if (this.scenario === "invalidPhone") {
      throw new AirtimePayError({
        code: "INVALID_PHONE",
        message: `Invalid phone number: ${request.phone}`,
        provider: this.name,
        statusCode: 400,
      });
    }
    if (this.scenario === "insufficientBalance") {
      throw new AirtimePayError({
        code: "INSUFFICIENT_BALANCE",
        message: "Insufficient balance for this transaction",
        provider: this.name,
        statusCode: 402,
      });
    }
    if (this.customConfig?.payment?.failWithCode) {
      throw new AirtimePayError({
        code: "PROVIDER_ERROR",
        message: this.customConfig.payment.failWithMessage ?? "Custom scenario error",
        provider: this.name,
        statusCode: 400,
      });
    }
  }

  private resolveStatus(): TransactionStatus {
    if (this.customConfig?.payment?.status) return this.customConfig.payment.status;
    if (this.scenario === "failed") return "failed";
    if (this.scenario === "pending") return "pending";
    return "successful";
  }

  private parsePhone(phone: string): string {
    try {
      return normalizePhone(phone);
    } catch {
      throw new AirtimePayError({
        code: "INVALID_PHONE",
        message: `Invalid phone number: ${phone}`,
        provider: this.name,
        statusCode: 400,
      });
    }
  }

  private fireEvent(type: WebhookEventType, data: unknown): void {
    const event = { id: generateTxId(), type, provider: this.name, data, createdAt: now() };
    this.eventHistory.push(event);
    for (const handler of this.webhookHandlers.get(type) ?? []) {
      handler(event);
    }
  }
}