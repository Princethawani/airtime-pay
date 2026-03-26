import type { MobileMoneyProvider, PaymentRequest, PaymentResponse, BalanceResponse, TransactionStatusResponse, RefundRequest, RefundResponse } from "../../payments/interface/types";
import type { MpambaConfig } from "../../../config";
import { DEFAULTS } from "../../../config";
import { AirtimePayError, providerError } from "../../../middlewares/errors";
import { withRetry } from "../../../middlewares/retry";
import { logger } from "../../../middlewares/logger";
import { normalizePhone } from "../../../utils/phone";
import { assertPositiveAmount } from "../../../utils/money";
import { now } from "../../../utils/idGenerator";

/**
 * TNM Mpamba provider.
 *
 * Auth: API key passed as a header on every request.
 *
 * NOTE: In production this makes real HTTP calls to the Mpamba API.
 * In tests, use MockProvider instead.
 */
export class MpambaProvider implements MobileMoneyProvider {
  readonly name = "mpamba" as const;

  private readonly cfg: Required<Omit<MpambaConfig, "provider">>;

  constructor(config: MpambaConfig) {
    this.cfg = {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl ?? DEFAULTS.mpamba.baseUrl,
      currency: config.currency ?? DEFAULTS.currency,
      timeoutMs: config.timeoutMs ?? DEFAULTS.timeoutMs,
      maxRetries: config.maxRetries ?? DEFAULTS.maxRetries,
    };
  }

  // ── Public methods ──────────────────────────────────────────────────────────

  async pay(request: PaymentRequest): Promise<PaymentResponse> {
    assertPositiveAmount(request.amount, this.name);
    const phone = normalizePhone(request.phone);

    logger.log("info", this.name, "pay", request.reference);

    return withRetry(async () => {
      const res = await this.post(DEFAULTS.mpamba.paymentPath, {
        msisdn: phone.replace("+265", "0"), // Mpamba expects local format
        amount: request.amount / 100,
        currency: this.cfg.currency,
        externalRef: request.reference,
        narration: request.description ?? request.reference,
      });

      return this.mapPaymentResponse(res, request, phone);
    }, this.cfg.maxRetries, this.name);
  }

  async balance(): Promise<BalanceResponse> {
    logger.log("info", this.name, "balance");

    return withRetry(async () => {
      const res = await this.get(DEFAULTS.mpamba.balancePath);
      return {
        balance: Math.round((res?.balance ?? 0) * 100),
        currency: this.cfg.currency,
        provider: this.name,
        retrievedAt: now(),
      };
    }, this.cfg.maxRetries, this.name);
  }

  async status(transactionId: string): Promise<TransactionStatusResponse> {
    logger.log("info", this.name, "status", transactionId);

    return withRetry(async () => {
      const res = await this.get(`${DEFAULTS.mpamba.transactionPath}${transactionId}`);
      return this.mapStatusResponse(res, transactionId);
    }, this.cfg.maxRetries, this.name);
  }

  async refund(request: RefundRequest): Promise<RefundResponse> {
    logger.log("info", this.name, "refund", request.transactionId);

    return withRetry(async () => {
      const res = await this.post(DEFAULTS.mpamba.refundPath, {
        transactionId: request.transactionId,
        amount: request.amount ? request.amount / 100 : undefined,
        reason: request.reason,
      });

      return {
        refundId: res?.refundId ?? request.transactionId,
        transactionId: request.transactionId,
        amount: request.amount ?? 0,
        currency: this.cfg.currency,
        status: "successful",
        provider: this.name,
        createdAt: now(),
      };
    }, this.cfg.maxRetries, this.name);
  }

  // ── HTTP helpers ────────────────────────────────────────────────────────────

  private async get(path: string): Promise<any> {
    return this.request("GET", path, null);
  }

  private async post(path: string, body: unknown): Promise<any> {
    return this.request("POST", path, body);
  }

  private async request(method: string, path: string, body: unknown): Promise<any> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.cfg.timeoutMs);

    try {
      const res = await fetch(`${this.cfg.baseUrl}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.cfg.apiKey}`,
          "X-Currency": this.cfg.currency,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        providerError(
          this.name,
          res.status === 401 ? "INVALID_CREDENTIALS" : "PROVIDER_ERROR",
          data?.message ?? `Mpamba API error ${res.status}`,
          res.status,
          data
        );
      }

      return data;
    } catch (err) {
      if (err instanceof AirtimePayError) throw err;
      if ((err as Error).name === "AbortError") {
        providerError(this.name, "TIMEOUT", "Mpamba API request timed out", 408);
      }
      providerError(this.name, "NETWORK_ERROR", (err as Error).message, 503, err);
    } finally {
      clearTimeout(timer);
    }
  }

  // ── Response mappers ────────────────────────────────────────────────────────

  private mapPaymentResponse(raw: any, req: PaymentRequest, phone: string): PaymentResponse {
    const statusRaw = (raw?.status ?? raw?.transactionStatus ?? "").toUpperCase();
    const status =
      statusRaw === "SUCCESS" ? "successful"
      : statusRaw === "PENDING" ? "pending"
      : "failed";

    return {
      transactionId: raw?.transactionId ?? req.reference,
      reference: req.reference,
      status,
      amount: req.amount,
      currency: this.cfg.currency,
      phone,
      provider: this.name,
      message: raw?.message ?? "Payment initiated",
      createdAt: now(),
      raw,
    };
  }

  private mapStatusResponse(raw: any, transactionId: string): TransactionStatusResponse {
    const statusRaw = (raw?.status ?? raw?.transactionStatus ?? "").toUpperCase();
    const status =
      statusRaw === "SUCCESS" ? "successful"
      : statusRaw === "PENDING" ? "pending"
      : "failed";

    return {
      transactionId,
      reference: raw?.externalRef ?? transactionId,
      status,
      amount: Math.round((raw?.amount ?? 0) * 100),
      currency: this.cfg.currency,
      phone: raw?.msisdn ? normalizePhone(raw.msisdn) : "",
      provider: this.name,
      updatedAt: now(),
      raw,
    };
  }
}