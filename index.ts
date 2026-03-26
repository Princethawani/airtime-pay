import type { AirtimePayConfig } from "./config";
import { AirtelProvider } from "./src/providers/airtel/AirtelProvider";
import { MpambaProvider } from "./src/providers/mpamba/MpambaProvider";
import { MockProvider } from "./src/providers/mock/MockProvider";
import type { MobileMoneyProvider } from "./src/payments/interface/types";

/**
 * Create an AirtimePay SDK instance.
 *
 * @example — Airtel Money
 * const pay = createAirtimePay({
 *   provider: "airtel",
 *   clientId: process.env.AIRTEL_CLIENT_ID!,
 *   clientSecret: process.env.AIRTEL_CLIENT_SECRET!,
 * });
 *
 * @example — TNM Mpamba
 * const pay = createAirtimePay({
 *   provider: "mpamba",
 *   apiKey: process.env.MPAMBA_API_KEY!,
 * });
 *
 * @example — Mock (for tests)
 * const pay = createAirtimePay({ provider: "mock" });
 */
export function createAirtimePay(config: AirtimePayConfig): MobileMoneyProvider {
  switch (config.provider) {
    case "airtel":  return new AirtelProvider(config);
    case "mpamba":  return new MpambaProvider(config);
    case "mock":    return new MockProvider(config);
    default: {
      const _: never = config;
      throw new Error(`Unknown provider`);
    }
  }
}

// ── Named exports ──────────────────────────────────────────────────────────────
export { AirtelProvider }  from "./src/providers/airtel/AirtelProvider";
export { MpambaProvider }  from "./src/providers/mpamba/MpambaProvider";
export { MockProvider }    from "./src/providers/mock/MockProvider";
export { AirtimePayError } from "./middlewares/errors";
export { normalizePhone, detectNetwork } from "./utils/phone";
export { formatMKW, toTambala, toKwacha } from "./utils/money";

export type { AirtimePayConfig }    from "./config";
export type { MockScenario, MockScenarioConfig } from "./src/providers/mock/MockProvider";
export type {
  MobileMoneyProvider,
  PaymentRequest,
  PaymentResponse,
  BalanceResponse,
  TransactionStatusResponse,
  RefundRequest,
  RefundResponse,
  WebhookEvent,
  WebhookEventType,
  TransactionStatus,
  ProviderName,
} from "./src/payments/interface/types";