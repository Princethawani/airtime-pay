import { describe, it, expect, beforeEach } from "vitest";
import { MockProvider, AirtimePayError, formatMKW, toTambala, normalizePhone, detectNetwork } from "../index";

let mock: MockProvider;

beforeEach(() => {
  mock = new MockProvider({ provider: "mock" });
});

// ─── Payments ──────────────────────────────────────────────────────────────────

describe("pay()", () => {
  it("succeeds with a valid Airtel number", async () => {
    const res = await mock.pay({
      amount: 100_000,        // MK 1,000
      phone: "0888123456",
      reference: "ORDER-001",
      description: "Test payment",
    });

    expect(res.transactionId).toMatch(/^TX-/);
    expect(res.status).toBe("successful");
    expect(res.amount).toBe(100_000);
    expect(res.currency).toBe("MWK");
    expect(res.phone).toBe("+265888123456");
    expect(res.provider).toBe("mock");
    expect(res.reference).toBe("ORDER-001");
  });

  it("succeeds with a TNM number", async () => {
    const res = await mock.pay({
      amount: 50_000,
      phone: "0999456789",
      reference: "ORDER-002",
    });
    expect(res.status).toBe("successful");
    expect(res.phone).toBe("+265999456789");
  });

  it("accepts +265 format phone", async () => {
    const res = await mock.pay({ amount: 10_000, phone: "+265888000111", reference: "R1" });
    expect(res.phone).toBe("+265888000111");
  });

  it("returns pending status with pending scenario", async () => {
    mock.use("pending");
    const res = await mock.pay({ amount: 10_000, phone: "0888123456", reference: "R2" });
    expect(res.status).toBe("pending");
  });

  it("returns failed status with failed scenario", async () => {
    mock.use("failed");
    const res = await mock.pay({ amount: 10_000, phone: "0888123456", reference: "R3" });
    expect(res.status).toBe("failed");
  });

  it("throws INSUFFICIENT_BALANCE", async () => {
    mock.use("insufficientBalance");
    await expect(
      mock.pay({ amount: 10_000, phone: "0888123456", reference: "R4" })
    ).rejects.toMatchObject({ code: "INSUFFICIENT_BALANCE" });
  });

  it("throws INVALID_PHONE for bad number", async () => {
    mock.use("invalidPhone");
    await expect(
      mock.pay({ amount: 10_000, phone: "12345", reference: "R5" })
    ).rejects.toMatchObject({ code: "INVALID_PHONE" });
  });

  it("throws DUPLICATE_TRANSACTION", async () => {
    mock.use("duplicate");
    await expect(
      mock.pay({ amount: 10_000, phone: "0888123456", reference: "R6" })
    ).rejects.toMatchObject({ code: "DUPLICATE_TRANSACTION" });
  });

  it("throws NETWORK_ERROR", async () => {
    mock.use("networkError");
    await expect(
      mock.pay({ amount: 10_000, phone: "0888123456", reference: "R7" })
    ).rejects.toMatchObject({ code: "NETWORK_ERROR" });
  });

  it("throws TIMEOUT", async () => {
    mock.use("timeout");
    await expect(
      mock.pay({ amount: 10_000, phone: "0888123456", reference: "R8" })
    ).rejects.toMatchObject({ code: "TIMEOUT" });
  });

  it("throws on zero amount", async () => {
    await expect(
      mock.pay({ amount: 0, phone: "0888123456", reference: "R9" })
    ).rejects.toThrow();
  });

  it("supports custom scenario config", async () => {
    mock.useCustom({ payment: { status: "processing" } });
    const res = await mock.pay({ amount: 10_000, phone: "0888123456", reference: "R10" });
    expect(res.status).toBe("processing");
  });
});

// ─── Balance ───────────────────────────────────────────────────────────────────

describe("balance()", () => {
  it("returns default balance of MK 500,000", async () => {
    const b = await mock.balance();
    expect(b.balance).toBe(50_000_00);
    expect(b.currency).toBe("MWK");
    expect(b.provider).toBe("mock");
  });

  it("returns custom balance set via setBalance()", async () => {
    mock.setBalance(250_000);
    const b = await mock.balance();
    expect(b.balance).toBe(250_000);
  });
});

// ─── Transaction status ────────────────────────────────────────────────────────

describe("status()", () => {
  it("retrieves a transaction by ID", async () => {
    const payment = await mock.pay({ amount: 20_000, phone: "0888111222", reference: "STATUS-01" });
    const status = await mock.status(payment.transactionId);

    expect(status.transactionId).toBe(payment.transactionId);
    expect(status.status).toBe("successful");
    expect(status.amount).toBe(20_000);
  });

  it("throws TRANSACTION_NOT_FOUND for unknown ID", async () => {
    await expect(mock.status("TX-GHOST")).rejects.toMatchObject({
      code: "TRANSACTION_NOT_FOUND",
      statusCode: 404,
    });
  });
});

// ─── Refunds ───────────────────────────────────────────────────────────────────

describe("refund()", () => {
  it("refunds a successful transaction", async () => {
    const payment = await mock.pay({ amount: 30_000, phone: "0888333444", reference: "REF-01" });
    const refund = await mock.refund({ transactionId: payment.transactionId });

    expect(refund.refundId).toMatch(/^TX-/);
    expect(refund.amount).toBe(30_000);
    expect(refund.status).toBe("successful");

    // Original transaction should now show refunded
    const updated = await mock.status(payment.transactionId);
    expect(updated.status).toBe("refunded");
  });

  it("supports partial refunds", async () => {
    const payment = await mock.pay({ amount: 50_000, phone: "0888555666", reference: "REF-02" });
    const refund = await mock.refund({ transactionId: payment.transactionId, amount: 20_000 });
    expect(refund.amount).toBe(20_000);
  });

  it("throws REFUND_NOT_ALLOWED for failed transaction", async () => {
    mock.use("failed");
    const payment = await mock.pay({ amount: 10_000, phone: "0888777888", reference: "REF-03" });
    mock.use("success"); // reset scenario

    await expect(
      mock.refund({ transactionId: payment.transactionId })
    ).rejects.toMatchObject({ code: "REFUND_NOT_ALLOWED" });
  });

  it("throws INVALID_AMOUNT when refund exceeds original", async () => {
    const payment = await mock.pay({ amount: 10_000, phone: "0888999000", reference: "REF-04" });
    await expect(
      mock.refund({ transactionId: payment.transactionId, amount: 99_999 })
    ).rejects.toMatchObject({ code: "INVALID_AMOUNT" });
  });
});

// ─── Webhooks ──────────────────────────────────────────────────────────────────

describe("webhooks", () => {
  it("fires payment.successful on success", async () => {
    const handler = vi.fn();
    mock.on("payment.successful", handler);

    await mock.pay({ amount: 10_000, phone: "0888123456", reference: "WH-01" });

    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].type).toBe("payment.successful");
    expect(handler.mock.calls[0][0].provider).toBe("mock");
  });

  it("fires payment.failed when failed scenario", async () => {
    const handler = vi.fn();
    mock.on("payment.failed", handler);
    mock.use("failed");

    await mock.pay({ amount: 10_000, phone: "0888123456", reference: "WH-02" });
    expect(handler).toHaveBeenCalledOnce();
  });

  it("fires payment.pending when pending scenario", async () => {
    const handler = vi.fn();
    mock.on("payment.pending", handler);
    mock.use("pending");

    await mock.pay({ amount: 10_000, phone: "0888123456", reference: "WH-03" });
    expect(handler).toHaveBeenCalledOnce();
  });

  it("fires refund.successful after refund", async () => {
    const handler = vi.fn();
    mock.on("refund.successful", handler);

    const payment = await mock.pay({ amount: 20_000, phone: "0888123456", reference: "WH-04" });
    await mock.refund({ transactionId: payment.transactionId });

    expect(handler).toHaveBeenCalledOnce();
  });

  it("stores full event history", async () => {
    await mock.pay({ amount: 10_000, phone: "0888123456", reference: "WH-05" });
    expect(mock.getEventHistory()).toHaveLength(1);
    expect(mock.getEventHistory()[0].type).toBe("payment.successful");
  });

  it("listens to multiple event types at once", async () => {
    const handler = vi.fn();
    mock.on(["payment.successful", "payment.failed"], handler);

    await mock.pay({ amount: 10_000, phone: "0888123456", reference: "WH-06" });
    mock.use("failed");
    await mock.pay({ amount: 10_000, phone: "0888123456", reference: "WH-07" });

    expect(handler).toHaveBeenCalledTimes(2);
  });
});

// ─── Utils ─────────────────────────────────────────────────────────────────────

describe("phone utils", () => {
  it("normalizes local format", () => {
    expect(normalizePhone("0888123456")).toBe("+265888123456");
    expect(normalizePhone("0999456789")).toBe("+265999456789");
  });

  it("normalizes +265 format", () => {
    expect(normalizePhone("+265888123456")).toBe("+265888123456");
  });

  it("normalizes 265 format without +", () => {
    expect(normalizePhone("265888123456")).toBe("+265888123456");
  });

  it("detects Airtel network", () => {
    expect(detectNetwork("0888123456")).toBe("airtel");
    expect(detectNetwork("0778123456")).toBe("airtel");
  });

  it("detects TNM network", () => {
    expect(detectNetwork("0999123456")).toBe("tnm");
    expect(detectNetwork("0841234567")).toBe("tnm");
  });

  it("throws on invalid number", () => {
    expect(() => normalizePhone("12345")).toThrow();
  });
});

describe("money utils", () => {
  it("formats MKW from tambala", () => {
    expect(formatMKW(100_000)).toBe("MK 1,000.00");
    expect(formatMKW(50)).toBe("MK 0.50");
    expect(formatMKW(1_500_000)).toBe("MK 15,000.00");
  });

  it("converts kwacha to tambala safely", () => {
    expect(toTambala(1000)).toBe(100_000);
    expect(toTambala(0.5)).toBe(50);
  });
});

describe("MockProvider.reset()", () => {
  it("clears all transactions and resets scenario", async () => {
    mock.use("failed");
    await mock.pay({ amount: 10_000, phone: "0888123456", reference: "RST-01" });
    mock.reset();

    expect(mock.getAllTransactions()).toHaveLength(0);
    const res = await mock.pay({ amount: 10_000, phone: "0888123456", reference: "RST-02" });
    expect(res.status).toBe("successful");
  });
});

// ─── createAirtimePay factory ─────────────────────────────────────────────────

import { createAirtimePay } from "../index";
import { vi } from "vitest";

describe("createAirtimePay()", () => {
  it("returns a MockProvider for provider: mock", () => {
    const p = createAirtimePay({ provider: "mock" });
    expect(p.name).toBe("mock");
  });

  it("returns an AirtelProvider for provider: airtel", () => {
    const p = createAirtimePay({ provider: "airtel", clientId: "x", clientSecret: "y" });
    expect(p.name).toBe("airtel");
  });

  it("returns a MpambaProvider for provider: mpamba", () => {
    const p = createAirtimePay({ provider: "mpamba", apiKey: "key" });
    expect(p.name).toBe("mpamba");
  });
});