export type ProviderName = "airtel" | "mpamba" | "mock";

export interface AirtelConfig {
  provider: "airtel";
  clientId: string;
  clientSecret: string;
  baseUrl?: string;          // defaults to Airtel Africa production
  country?: string;          // defaults to "MW"
  currency?: string;         // defaults to "MWK"
  timeoutMs?: number;
  maxRetries?: number;
}

export interface MpambaConfig {
  provider: "mpamba";
  apiKey: string;
  baseUrl?: string;          // defaults to TNM Mpamba production
  currency?: string;         // defaults to "MWK"
  timeoutMs?: number;
  maxRetries?: number;
}

export interface MockConfig {
  provider: "mock";
  currency?: string;
}

export type AirtimePayConfig = AirtelConfig | MpambaConfig | MockConfig;

export const DEFAULTS = {
  currency: "MWK",
  country: "MW",
  timeoutMs: 30_000,
  maxRetries: 2,
  airtel: {
    baseUrl: "https://openapi.airtel.africa",
    tokenPath: "/auth/oauth2/token",
    paymentPath: "/merchant/v2/payments/",
    balancePath: "/standard/v1/users/balance",
    transactionPath: "/standard/v1/payments/",
    refundPath: "/standard/v1/payments/refund",
  },
  mpamba: {
    baseUrl: "https://api.mpamba.co.mw",
    paymentPath: "/v1/transactions/initiate",
    balancePath: "/v1/wallet/balance",
    transactionPath: "/v1/transactions/",
    refundPath: "/v1/transactions/refund",
  },
};