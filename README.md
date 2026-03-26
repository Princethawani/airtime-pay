# airtime-pay

[![CI](https://github.com/princethawani/airtime-pay/actions/workflows/ci.yml/badge.svg)](https://github.com/princethawani/airtime-pay/actions)
[![npm version](https://img.shields.io/npm/v/airtime-pay.svg)](https://www.npmjs.com/package/airtime-pay)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Unified TypeScript SDK for **Airtel Money** and **TNM Mpamba** — Malawi's two major mobile money providers. One interface, both providers, full TypeScript types.

Built by [Prince Thawani](https://princethawani.com/) · [princethawani4@gmail.com](mailto:princethawani4@gmail.com)

---

## Features

- Single `createAirtimePay()` factory — swap providers with one config change
- Full TypeScript types — same shape for both providers
- Automatic OAuth2 token refresh (Airtel)
- Malawian phone number normalization — accepts `0888...`, `265888...`, `+265888...`
- MKW money utilities — safe tambala arithmetic, `MK 1,000.00` formatting
- Built-in retry with exponential backoff
- `MockProvider` for unit tests — no network, full scenario control
- Zero runtime dependencies

## Installation

```bash
npm install airtime-pay
```

## Quickstart

```typescript
import { createAirtimePay } from "airtime-pay";

// ── Airtel Money ───────────────────────────────────────────────────────────────
const airtel = createAirtimePay({
  provider: "airtel",
  clientId: process.env.AIRTEL_CLIENT_ID!,
  clientSecret: process.env.AIRTEL_CLIENT_SECRET!,
});

// ── TNM Mpamba ────────────────────────────────────────────────────────────────
const mpamba = createAirtimePay({
  provider: "mpamba",
  apiKey: process.env.MPAMBA_API_KEY!,
});

// ── Same API for both ─────────────────────────────────────────────────────────
const result = await airtel.pay({
  amount: 100_000,       // MK 1,000 in tambala (1 tambala = MK 0.01)
  currency: "MWK",
  phone: "0888123456",   // any Malawian format accepted
  reference: "ORDER-001",
  description: "Payment for order #001",
});

console.log(result.status);        // "successful" | "pending" | "failed"
console.log(result.transactionId); // provider transaction ID
console.log(result.phone);         // "+265888123456" (normalized)
```

## All methods

```typescript
// Initiate a payment
const payment = await provider.pay({ amount, phone, reference, description? });

// Check wallet balance
const balance = await provider.balance();
console.log(balance.balance); // in tambala

// Check transaction status
const status = await provider.status(transactionId);

// Refund a transaction
const refund = await provider.refund({ transactionId, amount? }); // amount omit = full refund
```

## Amounts — tambala

All amounts are in **tambala** (the smallest unit of MKW), the same way Stripe uses cents.

| You want | You pass |
|---|---|
| MK 1,000 | `100_000` |
| MK 500 | `50_000` |
| MK 50 | `5_000` |

```typescript
import { toTambala, toKwacha, formatMKW } from "airtime-pay";

toTambala(1000)      // → 100000
toKwacha(100000)     // → 1000
formatMKW(100000)    // → "MK 1,000.00"
```

## Phone numbers

Any Malawian format is accepted — the SDK normalizes to E.164 internally.

```typescript
import { normalizePhone, detectNetwork } from "airtime-pay";

normalizePhone("0888123456")   // → "+265888123456"
normalizePhone("265888123456") // → "+265888123456"
normalizePhone("+265888123456") // → "+265888123456"

detectNetwork("0888123456")   // → "airtel"
detectNetwork("0999456789")   // → "tnm"
```

## Testing with MockProvider

Use `MockProvider` in your tests — no network calls, no credentials needed.

```typescript
import { MockProvider } from "airtime-pay";
import { describe, it, expect, beforeEach } from "vitest";

const mock = new MockProvider({ provider: "mock" });

beforeEach(() => mock.reset());

it("charges a customer", async () => {
  const result = await mock.pay({
    amount: 50_000,
    phone: "0888123456",
    reference: "ORDER-001",
  });
  expect(result.status).toBe("successful");
});

it("handles declined payment", async () => {
  mock.use("insufficientBalance");
  await expect(
    mock.pay({ amount: 50_000, phone: "0888123456", reference: "ORDER-002" })
  ).rejects.toMatchObject({ code: "INSUFFICIENT_BALANCE" });
});
```

### Available scenarios

| Scenario | Behaviour |
|---|---|
| `success` | Payment succeeds (default) |
| `pending` | Payment stays pending |
| `failed` | Payment fails |
| `insufficientBalance` | Throws `INSUFFICIENT_BALANCE` |
| `invalidPhone` | Throws `INVALID_PHONE` |
| `timeout` | Throws `TIMEOUT` |
| `networkError` | Throws `NETWORK_ERROR` |
| `duplicate` | Throws `DUPLICATE_TRANSACTION` |

```typescript
mock.use("pending");                              // named scenario
mock.useCustom({ payment: { status: "processing" } }); // custom
mock.setBalance(500_000);                         // set wallet balance
```

### Webhook events in tests

```typescript
const handler = vi.fn();
mock.on("payment.successful", handler);

await mock.pay({ amount: 10_000, phone: "0888123456", reference: "R1" });

expect(handler).toHaveBeenCalledOnce();
expect(handler.mock.calls[0][0].type).toBe("payment.successful");

// Inspect full history
const events = mock.getEventHistory();
```

## Error handling

```typescript
import { AirtimePayError } from "airtime-pay";

try {
  await provider.pay({ amount: 10_000, phone: "0888123456", reference: "R1" });
} catch (err) {
  if (err instanceof AirtimePayError) {
    console.log(err.code);       // "INSUFFICIENT_BALANCE"
    console.log(err.provider);   // "airtel" | "mpamba" | "mock"
    console.log(err.statusCode); // 402
    console.log(err.message);    // human-readable message
  }
}
```

### Error codes

| Code | Meaning |
|---|---|
| `INVALID_CREDENTIALS` | Wrong API key or client secret |
| `INSUFFICIENT_BALANCE` | Customer wallet has insufficient funds |
| `INVALID_PHONE` | Phone number could not be normalized |
| `TRANSACTION_NOT_FOUND` | No transaction with that ID |
| `DUPLICATE_TRANSACTION` | Reference already used |
| `REFUND_NOT_ALLOWED` | Transaction not in refundable state |
| `INVALID_AMOUNT` | Amount is zero, negative, or exceeds original |
| `PROVIDER_ERROR` | Provider returned an unexpected error |
| `NETWORK_ERROR` | Could not reach the provider API |
| `TIMEOUT` | Request exceeded timeout |

## Docker

```bash
# Run tests
docker compose up test

# Watch mode for development
docker compose up dev

# Build production image
docker compose up prod
```

## Project structure

```
airtime-pay/
├── config/                          # Config types and defaults
├── middlewares/                     # Errors, retry, logger
├── src/
│   ├── payments/interface/types.ts  # All shared domain types
│   └── providers/
│       ├── airtel/AirtelProvider.ts
│       ├── mpamba/MpambaProvider.ts
│       └── mock/MockProvider.ts
├── utils/                           # phone, money, ID helpers
├── tests/
├── .github/workflows/ci.yml        # GitHub Actions CI
├── .env.example
├── docker-compose.yml
├── Dockerfile
└── index.ts                         # Public API
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) — adding a new provider takes about 30 minutes.

## License

MIT © [Prince Thawani](https://princethawani.com/)