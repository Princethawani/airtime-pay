# Contributing to airtime-pay

Thank you for helping improve airtime-pay! Here's how to get started.

## Development setup

```bash
git clone https://github.com/princethawani/airtime-pay.git
cd airtime-pay
npm install
cp .env.example .env   # fill in your credentials if testing against real APIs
npm run test:watch     # start vitest in watch mode
```

Or with Docker:

```bash
docker compose up dev  # watch mode inside a container
```

## Running tests

```bash
npm test               # run once
npm run test:watch     # watch mode
docker compose up test # run inside Docker
```

All tests run against `MockProvider` — no real API credentials needed.

## Adding a new provider

1. Create `src/providers/<name>/` with the same three-layer structure:
   ```
   src/providers/<name>/
   └── <Name>Provider.ts   # implements MobileMoneyProvider
   ```

2. Implement the `MobileMoneyProvider` interface from `src/payments/interface/types.ts`:
   ```ts
   export interface MobileMoneyProvider {
     readonly name: ProviderName;
     pay(request: PaymentRequest): Promise<PaymentResponse>;
     balance(): Promise<BalanceResponse>;
     status(transactionId: string): Promise<TransactionStatusResponse>;
     refund(request: RefundRequest): Promise<RefundResponse>;
   }
   ```

3. Add your config type to `config/index.ts` and the union in `AirtimePayConfig`.

4. Add a `case` for your provider in the `createAirtimePay()` factory in `index.ts`.

5. Add `ProviderName` to the union type in `src/payments/interface/types.ts`.

6. Write tests in `tests/<name>.test.ts` — use `MockProvider` as a reference.

7. Export your provider from `index.ts`.

## Folder structure

```
airtime-pay/
├── config/          # Provider config types and defaults
├── middlewares/     # Error classes, retry logic, request logger
├── src/
│   ├── payments/interface/types.ts   # All shared domain types
│   └── providers/
│       ├── airtel/  # AirtelProvider
│       ├── mpamba/  # MpambaProvider
│       └── mock/    # MockProvider (for tests)
├── utils/           # phone normalizer, MKW money helpers, ID generator
├── tests/           # Vitest test files
└── index.ts         # Public API + createAirtimePay() factory
```

## Code style

- TypeScript strict mode — no `any` except in HTTP response handling
- `err instanceof Error` guards in all catch blocks — never `(err as Error)`
- Amounts always in tambala (smallest unit) internally
- Phone numbers always normalized to E.164 (`+265XXXXXXXXX`) internally
- No external runtime dependencies

## Pull request checklist

- [ ] `npm run lint` passes with no errors
- [ ] `npm test` passes with no failures
- [ ] New provider has tests covering success, failure, and edge cases
- [ ] `README.md` updated if public API changed
- [ ] No `.env` or real credentials committed

## Commit message format

```
feat: add Natswitch provider
fix: normalize TNM 084x prefix detection
docs: add mpamba quickstart example
test: add refund edge cases for AirtelProvider
```

## Questions?

Open an issue or email princethawani4@gmail.com