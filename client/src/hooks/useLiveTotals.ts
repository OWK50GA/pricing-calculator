import { useMemo } from "react";
import { aggregateDocument } from "@pricing-calc/calculator";
import type { Currency } from "@pricing-calc/calculator";
import type { LineItem } from "@/api/documents";

/**
 * Computes document totals client-side in real time as line items change.
 * Uses the same shared calculator module as the server — results are
 * identical. These are display-only; the server recomputes on every
 * write and is the source of truth for stored values.
 */
export function useLiveTotals(lineItems: LineItem[], currency: string) {
  return useMemo(() => {
    // aggregateDocument expects LineItem from the shared package,
    // which is structurally identical to our API type
    return aggregateDocument(lineItems as Parameters<typeof aggregateDocument>[0], currency as Currency);
  }, [lineItems, currency]);
}
