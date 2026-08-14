import { Currency, toMajorUnit, toSmallestUnit } from "./currency.js";
import {
  DiscountType,
  DocumentResult,
  LineItem,
  LineItemResult,
} from "../types";

/**
 * RULES:
 * 1. Represent all the money in the smallest unit; cents, kobo, etc
 * 2. Represent all the money as a BigInt, not number, until display
 * 3. Integer division in BigInt truncates i.e. Math.floor(), so that is
 *    the rounding policy we are going with
 *
 * 7.5% = 750 bps
 * 5% = 500 bps
 * 0.3% = 30bps
 * 0.01% = 1bp
 */
export const BASIS_POINTS = 10_000n;

export const toBps = (percent: number): bigint => {
  return BigInt(Math.round(percent * 100));
};

export const fromBps = (bps: bigint): number => {
  return Number(bps) / 100;
};

export const applyBps = (amount: bigint, bps: bigint): bigint => {
  return (amount * bps) / BASIS_POINTS;
};

export function calculateLine(
  quantity: number,
  unitPrice: bigint, // assume it is already in the smallest unit
  discountType: DiscountType | null,
  discountValue: bigint | null, // assume it is already in the smallest unit
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
  const taxAmount = taxPercent
    ? applyBps(afterDiscount, toBps(taxPercent))
    : 0n;

  const lineTotal = afterDiscount + taxAmount;

  return {
    subTotal,
    discountAmount,
    afterDiscount,
    taxAmount,
    lineTotal,
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
    calculateLine(
      quantity,
      unitPriceSmallest,
      discountType,
      discountInternal,
      taxPercent,
    );

  return {
    subTotal: toMajorUnit(subTotal, currency),
    discountAmount: toMajorUnit(discountAmount, currency),
    afterDiscount: toMajorUnit(afterDiscount, currency),
    taxAmount: toMajorUnit(taxAmount, currency),
    lineTotal: toMajorUnit(lineTotal, currency),
  };
}

export type DocumentBigIntResult = {
  subTotal: bigint;
  totalDiscount: bigint;
  totalTax: bigint;
  grandTotal: bigint;
};

export function aggregateDocumentRaw(
  lines: LineItem[],
  currency: Currency,
): DocumentBigIntResult {
  let subTotal = 0n;
  let totalDiscount = 0n;
  let totalTax = 0n;

  for (const line of lines) {
    const discountType = line.discountType ?? null;
    const discountValue = line.discountValue ?? null;

    let discountInternal: bigint | null = null;
    if (discountType === "FIXED" && discountValue !== null) {
      discountInternal = toSmallestUnit(discountValue, currency);
    } else if (discountType === "PERCENT" && discountValue !== null) {
      discountInternal = toBps(discountValue);
    }

    const {
      subTotal: lineSubTotal,
      discountAmount,
      taxAmount,
    } = calculateLine(
      line.quantity,
      toSmallestUnit(line.unitPrice, currency),
      discountType,
      discountInternal,
      line.taxPercent,
    );

    subTotal      += lineSubTotal;
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
