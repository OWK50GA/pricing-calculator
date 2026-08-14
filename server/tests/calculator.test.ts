import { describe, it, expect } from "vitest";
import {
  BASIS_POINTS,
  toBps,
  fromBps,
  applyBps,
  calculateLine,
  calculateLineFromMajorUnits,
} from "../src/lib/calculator";
import {
  Currency,
  toSmallestUnit,
  toMajorUnit,
  SUBUNIT_MULTIPLIER,
} from "../src/lib/currency";

// ─────────────────────────────────────────────
// toBps
// ─────────────────────────────────────────────
describe("toBps", () => {
  it("converts whole percent correctly", () => {
    expect(toBps(5)).toBe(500n);
    expect(toBps(100)).toBe(10_000n);
    expect(toBps(0)).toBe(0n);
  });

  it("converts fractional percent correctly", () => {
    expect(toBps(7.5)).toBe(750n);
    expect(toBps(0.3)).toBe(30n);
    expect(toBps(0.01)).toBe(1n);
  });

  it("rounds to nearest basis point rather than truncating", () => {
    // 0.005% → 0.5 bps → rounds to 1
    expect(toBps(0.005)).toBe(1n);
    // 0.004% → 0.4 bps → rounds to 0
    expect(toBps(0.004)).toBe(0n);
  });

  it("handles VAT-style rates", () => {
    expect(toBps(7.5)).toBe(750n); // UK reduced VAT
    expect(toBps(20)).toBe(2000n); // UK standard VAT
    expect(toBps(7.25)).toBe(725n); // US sales tax example
  });
});

// ─────────────────────────────────────────────
// fromBps
// ─────────────────────────────────────────────
describe("fromBps", () => {
  it("converts basis points back to percent", () => {
    expect(fromBps(500n)).toBe(5);
    expect(fromBps(750n)).toBe(7.5);
    expect(fromBps(10_000n)).toBe(100);
    expect(fromBps(0n)).toBe(0);
  });

  it("round-trips with toBps for common rates", () => {
    const rates = [0, 0.01, 0.1, 0.3, 1, 5, 7.5, 10, 20, 100];
    for (const r of rates) {
      expect(fromBps(toBps(r))).toBe(r);
    }
  });
});

// ─────────────────────────────────────────────
// applyBps
// ─────────────────────────────────────────────
describe("applyBps", () => {
  it("applies a percentage via basis points", () => {
    // 10% of 1000 kobo = 100
    expect(applyBps(1000n, 1000n)).toBe(100n);
    // 7.5% of 1000 kobo = 75
    expect(applyBps(1000n, 750n)).toBe(75n);
    // 100% of any amount returns the same amount
    expect(applyBps(5000n, 10_000n)).toBe(5000n);
  });

  it("truncates (floors) rather than rounding", () => {
    // 7.5% of 1 kobo: (1 * 750) / 10000 = 0.075 → truncates to 0
    expect(applyBps(1n, 750n)).toBe(0n);
    // 1% of 99 kobo: (99 * 100) / 10000 = 0.99 → truncates to 0
    expect(applyBps(99n, 100n)).toBe(0n);
    // 1% of 100 kobo = 1
    expect(applyBps(100n, 100n)).toBe(1n);
  });

  it("returns 0 for 0 amount", () => {
    expect(applyBps(0n, 5000n)).toBe(0n);
  });

  it("returns 0 for 0 bps", () => {
    expect(applyBps(100_000n, 0n)).toBe(0n);
  });

  it("BASIS_POINTS constant is 10000n", () => {
    expect(BASIS_POINTS).toBe(10_000n);
  });
});

// ─────────────────────────────────────────────
// Currency helpers
// ─────────────────────────────────────────────
describe("toSmallestUnit / toMajorUnit", () => {
  it("converts NGN (100 kobo per naira)", () => {
    expect(toSmallestUnit(1, Currency.NGN)).toBe(100n);
    expect(toSmallestUnit(1.5, Currency.NGN)).toBe(150n);
    expect(toMajorUnit(150n, Currency.NGN)).toBe(1.5);
  });

  it("converts USD (100 cents per dollar)", () => {
    expect(toSmallestUnit(9.99, Currency.USD)).toBe(999n);
    expect(toMajorUnit(999n, Currency.USD)).toBe(9.99);
  });

  it("converts JPY (no subunit – multiplier is 1)", () => {
    expect(toSmallestUnit(500, Currency.JPY)).toBe(500n);
    expect(toMajorUnit(500n, Currency.JPY)).toBe(500);
  });

  it("converts KWD (1000 fils per dinar)", () => {
    expect(toSmallestUnit(1, Currency.KWD)).toBe(1000n);
    expect(toSmallestUnit(1.005, Currency.KWD)).toBe(1005n);
    expect(toMajorUnit(1005n, Currency.KWD)).toBe(1.005);
  });

  it("rounds floating-point input correctly for USD", () => {
    // 0.1 + 0.2 = 0.30000000000000004 in JS – should still round to 30 cents
    expect(toSmallestUnit(0.1 + 0.2, Currency.USD)).toBe(30n);
  });

  it("toSmallestUnit then toMajorUnit round-trips for exact amounts", () => {
    const cases: [number, Currency][] = [
      [1.5, Currency.NGN],
      [9.99, Currency.USD],
      [19.99, Currency.EUR],
      [1000, Currency.JPY],
      [2.5, Currency.KWD],
    ];
    for (const [amount, currency] of cases) {
      expect(toMajorUnit(toSmallestUnit(amount, currency), currency)).toBe(
        amount,
      );
    }
  });

  it("all currencies have a positive multiplier", () => {
    for (const currency of Object.values(Currency)) {
      expect(SUBUNIT_MULTIPLIER[currency]).toBeGreaterThan(0);
    }
  });
});

// ─────────────────────────────────────────────
// calculateLine — core engine
// ─────────────────────────────────────────────
describe("calculateLine", () => {
  describe("no discount, no tax (baseline)", () => {
    it("computes subtotal correctly", () => {
      const r = calculateLine(3, 1000n, null, null, null);
      expect(r.subTotal).toBe(3000n);
      expect(r.discountAmount).toBe(0n);
      expect(r.afterDiscount).toBe(3000n);
      expect(r.taxAmount).toBe(0n);
      expect(r.lineTotal).toBe(3000n);
    });

    it("quantity 1 is a no-op on unit price", () => {
      const r = calculateLine(1, 50000n, null, null, null);
      expect(r.subTotal).toBe(50000n);
      expect(r.lineTotal).toBe(50000n);
    });
  });

  describe("FIXED discount", () => {
    it("subtracts discount from subtotal before tax", () => {
      // 2 × 1000 = 2000, fixed discount 200, after = 1800
      const r = calculateLine(2, 1000n, "FIXED", 200n, null);
      expect(r.subTotal).toBe(2000n);
      expect(r.discountAmount).toBe(200n);
      expect(r.afterDiscount).toBe(1800n);
      expect(r.lineTotal).toBe(1800n);
    });

    it("applies tax on after-discount amount, not subtotal", () => {
      // 1 × 10000, fixed discount 2000, after = 8000, 10% tax = 800
      const r = calculateLine(1, 10000n, "FIXED", 2000n, 10);
      expect(r.afterDiscount).toBe(8000n);
      expect(r.taxAmount).toBe(800n);
      expect(r.lineTotal).toBe(8800n);
    });

    it("discount larger than subtotal produces negative afterDiscount", () => {
      // The system does not clamp – important to know the behaviour
      const r = calculateLine(1, 1000n, "FIXED", 5000n, null);
      expect(r.discountAmount).toBe(5000n);
      expect(r.afterDiscount).toBe(-4000n);
    });

    it("zero fixed discount has no effect", () => {
      // BUG PROBE: discountValue = 0n is falsy in BigInt, so the `if (discountValue)` guard
      // skips the branch entirely — discount stays 0. This test documents that behaviour.
      const r = calculateLine(2, 1000n, "FIXED", 0n, null);
      expect(r.discountAmount).toBe(0n);
      expect(r.afterDiscount).toBe(2000n);
    });
  });

  describe("PERCENT discount", () => {
    it("applies percent discount in basis points", () => {
      // 10% of 10000 = 1000
      const r = calculateLine(1, 10000n, "PERCENT", toBps(10), null);
      expect(r.discountAmount).toBe(1000n);
      expect(r.afterDiscount).toBe(9000n);
    });

    it("applies 100% discount leaving afterDiscount = 0", () => {
      const r = calculateLine(1, 10000n, "PERCENT", toBps(100), null);
      expect(r.discountAmount).toBe(10000n);
      expect(r.afterDiscount).toBe(0n);
      expect(r.lineTotal).toBe(0n);
    });

    it("fractional percent (7.5%) truncates correctly", () => {
      // 7.5% of 1001 kobo: (1001 * 750) / 10000 = 75.075 → truncates to 75
      const r = calculateLine(1, 1001n, "PERCENT", toBps(7.5), null);
      expect(r.discountAmount).toBe(75n);
      expect(r.afterDiscount).toBe(926n);
    });

    it("0% discount has no effect", () => {
      // BUG PROBE: toBps(0) = 0n which is falsy, so `if (discountValue)` skips.
      // Discount stays 0 — same result, but for the wrong reason.
      const r = calculateLine(1, 10000n, "PERCENT", toBps(0), null);
      expect(r.discountAmount).toBe(0n);
      expect(r.afterDiscount).toBe(10000n);
    });

    it("taxes are applied after percent discount", () => {
      // 1 × 20000, 25% discount → 15000, then 20% tax → 3000 tax
      const r = calculateLine(1, 20000n, "PERCENT", toBps(25), 20);
      expect(r.discountAmount).toBe(5000n);
      expect(r.afterDiscount).toBe(15000n);
      expect(r.taxAmount).toBe(3000n);
      expect(r.lineTotal).toBe(18000n);
    });
  });

  describe("tax only (no discount)", () => {
    it("applies tax on the full subtotal when no discount", () => {
      // 4 × 2500 = 10000, 10% tax = 1000
      const r = calculateLine(4, 2500n, null, null, 10);
      expect(r.subTotal).toBe(10000n);
      expect(r.discountAmount).toBe(0n);
      expect(r.taxAmount).toBe(1000n);
      expect(r.lineTotal).toBe(11000n);
    });

    it("tax on sub-kobo amounts truncates without crashing", () => {
      // 1 × 1, 7.5% tax: (1 * 750) / 10000 = 0 (truncated)
      const r = calculateLine(1, 1n, null, null, 7.5);
      expect(r.taxAmount).toBe(0n);
      expect(r.lineTotal).toBe(1n);
    });

    it("fractional tax rate (7.5%) truncates correctly", () => {
      // 1 × 10001, 7.5%: (10001 * 750) / 10000 = 750.075 → 750
      const r = calculateLine(1, 10001n, null, null, 7.5);
      expect(r.taxAmount).toBe(750n);
      expect(r.lineTotal).toBe(10751n);
    });
  });

  describe("discount + tax together", () => {
    it("order-of-operations: discount first, tax on remainder", () => {
      // 1 × 10000, PERCENT 20% → after = 8000, tax 10% → 800
      const r = calculateLine(1, 10000n, "PERCENT", toBps(20), 10);
      expect(r.subTotal).toBe(10000n);
      expect(r.discountAmount).toBe(2000n);
      expect(r.afterDiscount).toBe(8000n);
      expect(r.taxAmount).toBe(800n);
      expect(r.lineTotal).toBe(8800n);
    });

    it("FIXED discount + tax compound correctly", () => {
      // 5 × 1000 = 5000, fixed 500 → 4500, 5% tax → 225
      const r = calculateLine(5, 1000n, "FIXED", 500n, 5);
      expect(r.afterDiscount).toBe(4500n);
      expect(r.taxAmount).toBe(225n);
      expect(r.lineTotal).toBe(4725n);
    });
  });

  describe("edge cases and invariants", () => {
    it("quantity 0 produces all zeros", () => {
      const r = calculateLine(0, 1000n, "PERCENT", toBps(10), 20);
      expect(r.subTotal).toBe(0n);
      expect(r.discountAmount).toBe(0n);
      expect(r.afterDiscount).toBe(0n);
      expect(r.taxAmount).toBe(0n);
      expect(r.lineTotal).toBe(0n);
    });

    it("unit price 0 produces all zeros regardless of quantity", () => {
      const r = calculateLine(100, 0n, "PERCENT", toBps(50), 15);
      expect(r.subTotal).toBe(0n);
      expect(r.lineTotal).toBe(0n);
    });

    it("discountType PERCENT with null discountValue yields no discount", () => {
      // PERCENT type but value is null — should not crash
      const r = calculateLine(1, 10000n, "PERCENT", null, null);
      expect(r.discountAmount).toBe(0n);
      expect(r.lineTotal).toBe(10000n);
    });

    it("discountType FIXED with null discountValue yields no discount", () => {
      const r = calculateLine(1, 10000n, "FIXED", null, null);
      expect(r.discountAmount).toBe(0n);
      expect(r.lineTotal).toBe(10000n);
    });

    it("lineTotal always equals afterDiscount + taxAmount", () => {
      const cases = [
        calculateLine(3, 1500n, "PERCENT", toBps(10), 7.5),
        calculateLine(1, 99999n, "FIXED", 1000n, 20),
        calculateLine(10, 250n, null, null, 15),
        calculateLine(1, 1n, "PERCENT", toBps(50), 5),
      ];
      for (const r of cases) {
        expect(r.lineTotal).toBe(r.afterDiscount + r.taxAmount);
      }
    });

    it("afterDiscount always equals subTotal - discountAmount", () => {
      const cases = [
        calculateLine(2, 3000n, "FIXED", 500n, null),
        calculateLine(1, 10000n, "PERCENT", toBps(30), 10),
        calculateLine(5, 200n, null, null, null),
      ];
      for (const r of cases) {
        expect(r.afterDiscount).toBe(r.subTotal - r.discountAmount);
      }
    });

    it("large quantities do not overflow BigInt", () => {
      // 1,000,000 items at ₦1,000,000 each = ₦1 trillion in kobo
      const r = calculateLine(1_000_000, 100_000_000n, null, null, null);
      expect(r.subTotal).toBe(100_000_000_000_000n);
      expect(r.lineTotal).toBe(100_000_000_000_000n);
    });
  });
});

// ─────────────────────────────────────────────
// calculateLineFromMajorUnits
// ─────────────────────────────────────────────
describe("calculateLineFromMajorUnits", () => {
  describe("basic arithmetic in major units", () => {
    it("no discount, no tax — NGN", () => {
      const r = calculateLineFromMajorUnits(
        2,
        500,
        null,
        null,
        null,
        Currency.NGN,
      );
      expect(r.subTotal).toBe(1000);
      expect(r.discountAmount).toBe(0);
      expect(r.afterDiscount).toBe(1000);
      expect(r.taxAmount).toBe(0);
      expect(r.lineTotal).toBe(1000);
    });

    it("no discount, no tax — USD", () => {
      const r = calculateLineFromMajorUnits(
        3,
        9.99,
        null,
        null,
        null,
        Currency.USD,
      );
      expect(r.subTotal).toBeCloseTo(29.97, 2);
      expect(r.lineTotal).toBeCloseTo(29.97, 2);
    });
  });

  describe("FIXED discount in major units", () => {
    it("subtracts discount correctly — NGN", () => {
      // 1 × ₦10,000, fixed ₦1,500 off → ₦8,500
      const r = calculateLineFromMajorUnits(
        1,
        10000,
        "FIXED",
        1500,
        null,
        Currency.NGN,
      );
      expect(r.discountAmount).toBe(1500);
      expect(r.afterDiscount).toBe(8500);
    });

    it("converts fixed discount in KWD (3 decimals)", () => {
      // 1 × 1 KWD, ₀.500 discount → 0.500 remaining
      const r = calculateLineFromMajorUnits(
        1,
        1,
        "FIXED",
        0.5,
        null,
        Currency.KWD,
      );
      expect(r.discountAmount).toBe(0.5);
      expect(r.afterDiscount).toBe(0.5);
    });

    it("no subunit conversion for JPY fixed discount", () => {
      // 2 × ¥1000, fixed ¥300 off → ¥1700
      const r = calculateLineFromMajorUnits(
        2,
        1000,
        "FIXED",
        300,
        null,
        Currency.JPY,
      );
      expect(r.discountAmount).toBe(300);
      expect(r.afterDiscount).toBe(1700);
    });
  });

  describe("PERCENT discount in major units", () => {
    it("applies percent discount correctly", () => {
      // 1 × $100, 20% off → $80
      const r = calculateLineFromMajorUnits(
        1,
        100,
        "PERCENT",
        20,
        null,
        Currency.USD,
      );
      expect(r.discountAmount).toBe(20);
      expect(r.afterDiscount).toBe(80);
    });

    it("percent discount with tax applied post-discount", () => {
      // 1 × $200, 10% disc → $180, 10% tax → $18 tax, total $198
      const r = calculateLineFromMajorUnits(
        1,
        200,
        "PERCENT",
        10,
        10,
        Currency.USD,
      );
      expect(r.discountAmount).toBe(20);
      expect(r.afterDiscount).toBe(180);
      expect(r.taxAmount).toBe(18);
      expect(r.lineTotal).toBe(198);
    });
  });

  describe("tax only in major units", () => {
    it("applies VAT-style 7.5% tax — NGN", () => {
      // ₦10,000 × 1, 7.5% tax = ₦750
      const r = calculateLineFromMajorUnits(
        1,
        10000,
        null,
        null,
        7.5,
        Currency.NGN,
      );
      expect(r.taxAmount).toBe(750);
      expect(r.lineTotal).toBe(10750);
    });

    it("JPY — no fractional subunits so tax truncation happens at yen level", () => {
      // ¥1000, 7.5% tax: 1000 * 750 / 10000 = 75 yen
      const r = calculateLineFromMajorUnits(
        1,
        1000,
        null,
        null,
        7.5,
        Currency.JPY,
      );
      expect(r.taxAmount).toBe(75);
    });
  });

  describe("output invariants", () => {
    it("lineTotal = afterDiscount + taxAmount", () => {
      const cases = [
        calculateLineFromMajorUnits(3, 150, "PERCENT", 10, 7.5, Currency.NGN),
        calculateLineFromMajorUnits(1, 9.99, "FIXED", 1, 20, Currency.USD),
        calculateLineFromMajorUnits(10, 2.5, null, null, 15, Currency.EUR),
      ];
      for (const r of cases) {
        expect(r.lineTotal).toBeCloseTo(r.afterDiscount + r.taxAmount, 10);
      }
    });

    it("consistent with calculateLine for NGN PERCENT discount + tax", () => {
      const major = calculateLineFromMajorUnits(
        2,
        5000,
        "PERCENT",
        10,
        7.5,
        Currency.NGN,
      );
      // Manually replicate: 2 × 500000 kobo = 1000000, 10% → 100000 disc, 900000 after, 7.5% → 67500 tax
      const raw = calculateLine(2, 500000n, "PERCENT", toBps(10), 7.5);
      expect(major.subTotal).toBe(Number(raw.subTotal) / 100);
      expect(major.discountAmount).toBe(Number(raw.discountAmount) / 100);
      expect(major.taxAmount).toBe(Number(raw.taxAmount) / 100);
      expect(major.lineTotal).toBe(Number(raw.lineTotal) / 100);
    });
  });

  describe("currency-specific edge cases", () => {
    it("KWD price with 3 decimal places round-trips correctly", () => {
      const r = calculateLineFromMajorUnits(
        1,
        1.005,
        null,
        null,
        null,
        Currency.KWD,
      );
      expect(r.subTotal).toBe(1.005);
      expect(r.lineTotal).toBe(1.005);
    });

    it("JPY zero-decimal currency — no fractional output", () => {
      const r = calculateLineFromMajorUnits(
        3,
        330,
        null,
        null,
        10,
        Currency.JPY,
      );
      // 3 × 330 = 990, 10% tax = 99
      expect(r.subTotal).toBe(990);
      expect(r.taxAmount).toBe(99);
      expect(r.lineTotal).toBe(1089);
    });
  });
});

// ─────────────────────────────────────────────
// aggregateDocument
// ─────────────────────────────────────────────

// Minimal LineItem factory — only fields aggregateDocument cares about
function line(
  unitPrice: number,
  quantity: number,
  taxPercent: number,
  discountType?: LineItem["discountType"],
  discountValue?: number,
): LineItem {
  return {
    id: "test",
    documentId: "doc",
    description: "test line",
    quantity,
    unitPrice,
    taxPercent,
    discountType,
    discountValue,
  };
}

import { aggregateDocument } from "../src/lib/calculator";
import type { LineItem } from "../src/types";

describe("aggregateDocument", () => {
  describe("single line — mirrors calculateLine behaviour", () => {
    it("no discount no tax", () => {
      const r = aggregateDocument([line(1000, 2, 0)], Currency.NGN);
      expect(r.subTotal).toBe(2000);
      expect(r.totalDiscount).toBe(0);
      expect(r.totalTax).toBe(0);
      expect(r.grandTotal).toBe(2000);
    });

    it("PERCENT discount only", () => {
      // ₦10,000 × 1, 10% disc → ₦9,000
      const r = aggregateDocument(
        [line(10000, 1, 0, "PERCENT", 10)],
        Currency.NGN,
      );
      expect(r.subTotal).toBe(10000);
      expect(r.totalDiscount).toBe(1000);
      expect(r.grandTotal).toBe(9000);
    });

    it("FIXED discount only", () => {
      // ₦5,000 × 1, ₦500 fixed → ₦4,500
      const r = aggregateDocument(
        [line(5000, 1, 0, "FIXED", 500)],
        Currency.NGN,
      );
      expect(r.totalDiscount).toBe(500);
      expect(r.grandTotal).toBe(4500);
    });

    it("tax only", () => {
      // ₦10,000 × 1, 7.5% VAT → ₦750 tax
      const r = aggregateDocument([line(10000, 1, 7.5)], Currency.NGN);
      expect(r.totalTax).toBe(750);
      expect(r.grandTotal).toBe(10750);
    });

    it("discount then tax — order of operations preserved", () => {
      // ₦10,000 × 1, 20% disc → ₦8,000, 10% tax → ₦800
      const r = aggregateDocument(
        [line(10000, 1, 10, "PERCENT", 20)],
        Currency.NGN,
      );
      expect(r.totalDiscount).toBe(2000);
      expect(r.totalTax).toBe(800);
      expect(r.grandTotal).toBe(8800);
    });
  });

  describe("multi-line summation", () => {
    it("sums subtotals across lines", () => {
      const lines = [
        line(1000, 2, 0), // ₦2,000
        line(500, 3, 0), // ₦1,500
        line(2000, 1, 0), // ₦2,000
      ];
      const r = aggregateDocument(lines, Currency.NGN);
      expect(r.subTotal).toBe(5500);
      expect(r.grandTotal).toBe(5500);
    });

    it("sums discounts independently per line", () => {
      const lines = [
        line(10000, 1, 0, "PERCENT", 10), // ₦1,000 disc
        line(5000, 1, 0, "FIXED", 500), // ₦500 disc
      ];
      const r = aggregateDocument(lines, Currency.NGN);
      expect(r.subTotal).toBe(15000);
      expect(r.totalDiscount).toBe(1500);
      expect(r.grandTotal).toBe(13500);
    });

    it("sums taxes independently per line — mixed rates", () => {
      const lines = [
        line(10000, 1, 7.5), // ₦750 tax
        line(20000, 1, 5), // ₦1,000 tax
        line(5000, 1, 0), // ₦0 tax (exempt)
      ];
      const r = aggregateDocument(lines, Currency.NGN);
      expect(r.totalTax).toBe(1750);
      expect(r.grandTotal).toBe(36750);
    });

    it("lines with different discount types aggregate correctly", () => {
      const lines = [
        line(20000, 1, 10, "PERCENT", 25), // disc=5000, after=15000, tax=1500
        line(8000, 1, 10, "FIXED", 1000), // disc=1000, after=7000,  tax=700
      ];
      const r = aggregateDocument(lines, Currency.NGN);
      expect(r.subTotal).toBe(28000);
      expect(r.totalDiscount).toBe(6000);
      expect(r.totalTax).toBe(2200);
      expect(r.grandTotal).toBe(24200);
    });

    it("grandTotal = subTotal - totalDiscount + totalTax for all combinations", () => {
      const scenarios = [
        [line(1000, 1, 0), line(2000, 1, 0)],
        [line(5000, 2, 7.5, "PERCENT", 10), line(3000, 1, 5)],
        [line(10000, 1, 20, "FIXED", 1000), line(500, 4, 0)],
      ];
      for (const lines of scenarios) {
        const r = aggregateDocument(lines, Currency.NGN);
        expect(r.grandTotal).toBeCloseTo(
          r.subTotal - r.totalDiscount + r.totalTax,
          10,
        );
      }
    });
  });

  describe("edge cases", () => {
    it("empty line list returns all zeros", () => {
      const r = aggregateDocument([], Currency.NGN);
      expect(r.subTotal).toBe(0);
      expect(r.totalDiscount).toBe(0);
      expect(r.totalTax).toBe(0);
      expect(r.grandTotal).toBe(0);
    });

    it("lines with no discount fields are treated as no discount", () => {
      // discountType and discountValue are optional on LineItem
      const r = aggregateDocument([line(10000, 1, 7.5)], Currency.NGN);
      expect(r.totalDiscount).toBe(0);
      expect(r.totalTax).toBe(750);
    });

    it("USD — results in dollars not cents", () => {
      const r = aggregateDocument([line(9.99, 3, 0)], Currency.USD);
      expect(r.subTotal).toBeCloseTo(29.97, 2);
      expect(r.grandTotal).toBeCloseTo(29.97, 2);
    });

    it("JPY — no fractional output", () => {
      // ¥1000 × 2, 10% tax → ¥200 tax
      const r = aggregateDocument([line(1000, 2, 10)], Currency.JPY);
      expect(r.subTotal).toBe(2000);
      expect(r.totalTax).toBe(200);
      expect(r.grandTotal).toBe(2200);
    });

    it("KWD — 3 decimal precision preserved", () => {
      const r = aggregateDocument([line(1.005, 2, 0)], Currency.KWD);
      expect(r.subTotal).toBe(2.01);
      expect(r.grandTotal).toBe(2.01);
    });

    it("large document with many lines does not drift", () => {
      // 100 identical lines: ₦9,999 × 1 each, 7.5% tax
      const lines = Array.from({ length: 100 }, () => line(9999, 1, 7.5));
      const r = aggregateDocument(lines, Currency.NGN);
      // Each line in kobo: subTotal=999900k, tax=applyBps(999900, 750)
      //   = (999900 * 750) / 10000 = 749925000 / 10000 = 74992k (BigInt truncates)
      //   = ₦749.92 per line
      // 100 lines: subTotal=999900, tax=74992, grand=1074892
      expect(r.subTotal).toBe(999900);
      expect(r.totalTax).toBe(74992);
      expect(r.grandTotal).toBe(1074892);
    });

    it("a single fully-discounted line contributes nothing to grandTotal", () => {
      const lines = [
        line(5000, 1, 0, "PERCENT", 100), // 100% off
        line(3000, 1, 10), // normal line
      ];
      const r = aggregateDocument(lines, Currency.NGN);
      expect(r.totalDiscount).toBe(5000);
      // tax only on the second line's 3000
      expect(r.totalTax).toBe(300);
      expect(r.grandTotal).toBe(3300);
    });
  });

  describe("cross-check: aggregateDocument vs manual calculateLine sums", () => {
    it("matches hand-computed BigInt aggregation — NGN mixed", () => {
      // Line 1: qty=2, price=₦5,000, PERCENT 10%, tax 7.5%
      //   subTotal=1_000_000k, disc=100_000k, after=900_000k, tax=67_500k, total=967_500k
      // Line 2: qty=1, price=₦20,000, FIXED ₦2,000, tax 5%
      //   subTotal=2_000_000k, disc=200_000k, after=1_800_000k, tax=90_000k, total=1_890_000k
      const lines = [
        line(5000, 2, 7.5, "PERCENT", 10),
        line(20000, 1, 5, "FIXED", 2000),
      ];
      const r = aggregateDocument(lines, Currency.NGN);
      expect(r.subTotal).toBe(30000); // (2×5000) + (1×20000)
      expect(r.totalDiscount).toBe(3000); // 1000 + 2000
      expect(r.totalTax).toBe(1575); // 675 + 900
      expect(r.grandTotal).toBe(28575); // 30000 - 3000 + 1575
    });
  });
});
