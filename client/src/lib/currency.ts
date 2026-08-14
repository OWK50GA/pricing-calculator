export const CURRENCY_LABELS: Record<string, string> = {
  ngn: "NGN",
  gbp: "GBP",
  usd: "USD",
  eur: "EUR",
  jpy: "JPY",
  kwd: "KWD",
};

export const CURRENCY_OPTIONS = Object.entries(CURRENCY_LABELS).map(([value, label]) => ({
  value,
  label,
}));
