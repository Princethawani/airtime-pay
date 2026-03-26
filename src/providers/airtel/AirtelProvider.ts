import type { MobileMoneyProvider, PaymentRequest, PaymentResponse, BalanceResponse, TransactionStatusResponse, RefundRequest, RefundResponse } from "../../payments/interface/types";
import type { AirtelConfig } from "../../../config";
import { DEFAULTS } from "../../../config";
import { AirtimePayError, providerError } from "../../../middlewares/errors";
import { withRetry } from "../../../middlewares/retry";
import { logger } from "../../../middlewares/logger";
import { normalizePhone } from "../../../utils/phone";
import { assertPositiveAmount } from "../../../utils/money";
import { now } from "../../../utils/idGenerator";

interface AirtelToken {
  access_token: string;
  expires_at: number; // unix timestamp
}

/**
 * Airtel Money provider.
 *
 * Auth: OAuth2 client credentials — token is fetched automatically
 * and refreshed when it expires.
 *
 * NOTE: In production this makes real HTTP calls to Airtel Africa APIs.
 * In tests, use MockProvider instead.
 */
export class AirtelProvider implements MobileMoneyProvider {
  readonly name = "airtel" as const;

  private token: AirtelToken | null = null;
  private readonly cfg: Required<Omit<AirtelConfig, "provider">>;

  constructor(config: AirtelConfig) {
    this.cfg = {
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      baseUrl: config.baseUrl ?? DEFAULTS.airtel.baseUrl,
      country: config.country ?? DEFAULTS.country,
      currency: config.currency ?? DEFAULTS.currency,
      timeoutMs: config.timeoutMs ?? DEFAULTS.timeoutMs,
      maxRetries: config.maxRetries ?? DEFAULTS.maxRetries,
    };
  }

  // ── Public methods ──────────────────────────────────────────────────────────

  async pay(request: PaymentRequest): Promise<PaymentResponse> {
    assertPositiveAmount(request.amount, this.name);
    const phone = normalizePhone(request.phone);
    const token = await this.getToken();

    logger.log("info", this.name, "pay", request.reference);

    return withRetry(async () => {
      const res = await this.post(
        DEFAULTS.airtel.paymentPath,
        {
          reference: request.reference,
          subscriber: { country: this.cfg.country, currency: this.cfg.currency, msisdn: phone.replace("+", "") },
          transaction: {
            amount: request.amount / 100, // Airtel uses decimal kwacha
            country: this.cfg.country,
            currency: this.cfg.currency,
            id: request.reference,
          },
        },
        token
      );

      return this.mapPaymentResponse(res, request, phone);
    }, this.cfg.maxRetries, this.name);
  }

  async balance(): Promise<BalanceResponse> {
    const token = await this.getToken();
    logger.log("info", this.name, "balance");

    return withRetry(async () => {
      const res = await this.get(DEFAULTS.airtel.balancePath, token);
      return {
        balance: Math.round((res?.data?.balance ?? 0) * 100),
        currency: this.cfg.currency,
        provider: this.name,
        retrievedAt: now(),
      };
    }, this.cfg.maxRetries, this.name);
  }

  async status(transactionId: string): Promise<TransactionStatusResponse> {
    const token = await this.getToken();
    logger.log("info", this.name, "status", transactionId);

    return withRetry(async () => {
      const res = await this.get(
        `${DEFAULTS.airtel.transactionPath}${transactionId}`,
        token
      );
      return this.mapStatusResponse(res, transactionId);
    }, this.cfg.maxRetries, this.name);
  }

  async refund(request: RefundRequest): Promise<RefundResponse> {
    const token = await this.getToken();
    logger.log("info", this.name, "refund", request.transactionId);

    return withRetry(async () => {
      const res = await this.post(
        DEFAULTS.airtel.refundPath,
        {
          transaction: { airtel_money_id: request.transactionId },
        },
        token
      );
      return {
        refundId: res?.data?.transaction?.airtel_money_id ?? request.transactionId,
        transactionId: request.transactionId,
        amount: request.amount ?? 0,
        currency: this.cfg.currency,
        status: "successful",
        provider: this.name,
        createdAt: now(),
      };
    }, this.cfg.maxRetries, this.name);
  }

  // ── Token management ────────────────────────────────────────────────────────

  private async getToken(): Promise<string> {
    if (this.token && this.token.expires_at > now() + 60) {
      return this.token.access_token;
    }

    const res = await this.request("POST", DEFAULTS.airtel.tokenPath, {
      client_id: this.cfg.clientId,
      client_secret: this.cfg.clientSecret,
      grant_type: "client_credentials",
    });

    this.token = {
      access_token: res.access_token,
      expires_at: now() + (res.expires_in ?? 3600),
    };

    return this.token.access_token;
  }

  // ── HTTP helpers ────────────────────────────────────────────────────────────

  private async get(path: string, token: string): Promise<any> {
    return this.request("GET", path, null, token);
  }

  private async post(path: string, body: unknown, token: string): Promise<any> {
    return this.request("POST", path, body, token);
  }

  private async request(
    method: string,
    path: string,
    body: unknown,
    token?: string
  ): Promise<any> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.cfg.timeoutMs);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Country": this.cfg.country,
      "X-Currency": this.cfg.currency,
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    try {
      const res = await fetch(`${this.cfg.baseUrl}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const data: any = await res.json().catch(() => ({}));

      if (!res.ok) {
        providerError(
          this.name,
          res.status === 401 ? "INVALID_CREDENTIALS" : "PROVIDER_ERROR",
          data?.status?.message ?? `Airtel API error ${res.status}`,
          res.status,
          data
        );
      }

      return data;
    } catch (err) {
      if (err instanceof AirtimePayError) throw err;
      if (err instanceof Error && err.name === "AbortError") {
        providerError(this.name, "TIMEOUT", "Airtel API request timed out", 408);
      }
      const message = err instanceof Error ? err.message : "Unknown network error";
      providerError(this.name, "NETWORK_ERROR", message, 503, err);

    } finally {
      clearTimeout(timer);
    }
  }

  // ── Response mappers ────────────────────────────────────────────────────────

  private mapPaymentResponse(raw: any, req: PaymentRequest, phone: string): PaymentResponse {
    const status = raw?.data?.transaction?.status?.toLowerCase();
    return {
      transactionId: raw?.data?.transaction?.id ?? req.reference,
      reference: req.reference,
      status: status === "success" ? "successful" : status === "pending" ? "pending" : "failed",
      amount: req.amount,
      currency: this.cfg.currency,
      phone,
      provider: this.name,
      message: raw?.status?.message ?? "Payment initiated",
      createdAt: now(),
      raw,
    };
  }

  private mapStatusResponse(raw: any, transactionId: string): TransactionStatusResponse {
    const tx = raw?.data?.transaction ?? {};
    const status = (tx.status ?? "").toLowerCase();
    return {
      transactionId,
      reference: tx.id ?? transactionId,
      status: status === "success" ? "successful" : status === "pending" ? "pending" : "failed",
      amount: Math.round((tx.amount ?? 0) * 100),
      currency: this.cfg.currency,
      phone: tx.msisdn ? `+${tx.msisdn}` : "",
      provider: this.name,
      updatedAt: now(),
      raw,
    };
  }
}