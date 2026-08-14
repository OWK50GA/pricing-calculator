// Maps our internal currency code to a proper ISO 4217 code for Intl.NumberFormat
const CURRENCY_ISO: Record<string, string> = {
  ngn: "NGN",
  gbp: "GBP",
  usd: "USD",
  eur: "EUR",
  jpy: "JPY",
  kwd: "KWD",
};

export function formatCurrency(amount: number | null | undefined, currency: string): string {
  if (amount == null) return "—";
  const iso = CURRENCY_ISO[currency.toLowerCase()] ?? currency.toUpperCase();
  return new Intl.NumberFormat("en-US", {
    style:    "currency",
    currency: iso,
    minimumFractionDigits: iso === "JPY" ? 0 : 2,
  }).format(amount);
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day:   "2-digit",
    month: "short",
    year:  "numeric",
  }).format(new Date(dateStr));
}
