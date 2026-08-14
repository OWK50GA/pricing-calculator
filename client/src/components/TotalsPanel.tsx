import type { DocumentResult } from "@pricing-calc/calculator";
import { formatCurrency } from "@/lib/format";

type Props = {
  totals:   DocumentResult;
  currency: string;
  isLive:   boolean; // true = client-computed preview; false = server-confirmed
};

export function TotalsPanel({ totals, currency, isLive }: Props) {
  const fmt = (n: number) => formatCurrency(n, currency);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-2">
      {isLive && (
        <p className="text-xs text-amber-600 mb-3">
          Preview — totals confirmed on save
        </p>
      )}
      <Row label="Subtotal"       value={fmt(totals.subTotal)} />
      {totals.totalDiscount > 0 && (
        <Row label="Discount"     value={`−${fmt(totals.totalDiscount)}`} className="text-green-700" />
      )}
      {totals.totalTax > 0 && (
        <Row label="Tax"          value={fmt(totals.totalTax)} />
      )}
      <div className="border-t border-gray-200 pt-2">
        <Row label="Grand total"  value={fmt(totals.grandTotal)} bold />
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  bold = false,
  className = "",
}: {
  label: string;
  value: string;
  bold?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex justify-between text-sm ${className}`}>
      <span className={bold ? "font-semibold text-gray-900" : "text-gray-500"}>{label}</span>
      <span className={`tabular-nums ${bold ? "font-semibold text-gray-900" : "text-gray-700"}`}>
        {value}
      </span>
    </div>
  );
}
