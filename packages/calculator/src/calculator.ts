import { Currency, toMajorUnit, toSmallestUnit } from "./currency";
import type {
  DiscountType,
  DocumentBigIntResult,
  DocumentResult,
  LineItem,
  LineItemResult,
} from "./types";

/**
 * RULES:
 * 1. All money is represented in the smallest currency unit (kobo, cents, etc.)
 * 2. All intermediate math uses BigInt — no floating-point until display
 * 3. BigInt integer division truncates (floors) — this is the rounding policy
 *
 * 7.5% = 750 bps | 5% = 500 bps | 0.3% = 30 bps | 0.01% = 1 bp
 */
export const BASIS_POINTS = 10_000n;

export const toBps = (percent: number): bigint =>
  BigInt(Math.round(percent * 100));

export const fromBps = (bps: bigint): number => Number(bps) / 100;

export const applyBps = (amount: bigint, bps: bigint): bigint =>
  (amount * bps) / BASIS_POINTS;

export function calculateLine(
  quantity: number,
  unitPrice: bigint,        // already in smallest unit
  discountType: DiscountType | null,
  discountValue: bigint | null, // smallest unit if FIXED; bps if PERCENT
  taxPercent: number | null,
): {
  subTotal: bigint;
  discountAmount: bigint;
  afterDiscount: bigint;
  taxAmount: bigint;
  lineTotal: bigint;
} {
  const qty = BigInt(quantity);
  const subTotal = qty * unitPrice;

  let discountAmount = 0n;
  if (discountValue !== null) {
    if (discountType === "FIXED") {
      discountAmount = discountValue;
    } else if (discountType === "PERCENT") {
      discountAmount = applyBps(subTotal, discountValue);
    }
  }

  const afterDiscount = subTotal - discountAmount;
  const taxAmount = taxPercent ? applyBps(afterDiscount, toBps(taxPercent)) : 0n;

  return {
    subTotal,
    discountAmount,
    afterDiscount,
    taxAmount,
    lineTotal: afterDiscount + taxAmount,
  };
}

export function calculateLineFromMajorUnits(
  quantity: number,
  unitPrice: number,
  discountType: DiscountType | null,
  discountValue: number | null,
  taxPercent: number | null,
  currency: Currency,
): LineItemResult {
  const unitPriceSmallest = toSmallestUnit(unitPrice, currency);

  let discountInternal: bigint | null;
  if (discountType === "FIXED" && discountValue !== null) {
    discountInternal = toSmallestUnit(discountValue, currency);
  } else if (discountType === "PERCENT") {
    discountInternal = discountValue !== null ? toBps(discountValue) : null;
  } else {
    discountInternal = null;
  }

  const { subTotal, discountAmount, afterDiscount, taxAmount, lineTotal } =
    calculateLine(quantity, unitPriceSmallest, discountType, discountInternal, taxPercent);

  return {
    subTotal:       toMajorUnit(subTotal,       currency),
    discountAmount: toMajorUnit(discountAmount, currency),
    afterDiscount:  toMajorUnit(afterDiscount,  currency),
    taxAmount:      toMajorUnit(taxAmount,      currency),
    lineTotal:      toMajorUnit(lineTotal,      currency),
  };
}

export function aggregateDocumentRaw(
  lines: LineItem[],
  currency: Currency,
): DocumentBigIntResult {
  let subTotal = 0n;
  let totalDiscount = 0n;
  let totalTax = 0n;

  for (const line of lines) {
    const discountType  = line.discountType  ?? null;
    const discountValue = line.discountValue ?? null;

    let discountInternal: bigint | null = null;
    if (discountType === "FIXED" && discountValue !== null) {
      discountInternal = toSmallestUnit(discountValue, currency);
    } else if (discountType === "PERCENT" && discountValue !== null) {
      discountInternal = toBps(discountValue);
    }

    const { subTotal: ls, discountAmount, taxAmount } = calculateLine(
      line.quantity,
      toSmallestUnit(line.unitPrice, currency),
      discountType,
      discountInternal,
      line.taxPercent,
    );

    subTotal      += ls;
    totalDiscount += discountAmount;
    totalTax      += taxAmount;
  }

  return {
    subTotal,
    totalDiscount,
    totalTax,
    grandTotal: subTotal - totalDiscount + totalTax,
  };
}

export function aggregateDocument(
  lines: LineItem[],
  currency: Currency,
): DocumentResult {
  const raw = aggregateDocumentRaw(lines, currency);
  return {
    subTotal:      toMajorUnit(raw.subTotal,      currency),
    totalDiscount: toMajorUnit(raw.totalDiscount, currency),
    totalTax:      toMajorUnit(raw.totalTax,      currency),
    grandTotal:    toMajorUnit(raw.grandTotal,    currency),
  };
}
