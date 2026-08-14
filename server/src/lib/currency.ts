/**
 * Other currencies might come that have different subunit calculations
 */

export enum Currency {
  NGN = "ngn",
  GBP = "gbp",
  USD = "usd",
  EUR = "eur",
  JPY = "jpy",
  KWD = "kwd",
}

export const SUBUNIT_MULTIPLIER: Record<Currency, number> = {
  ngn: 100,
  gbp: 100,
  usd: 100,
  eur: 100,
  jpy: 1,
  kwd: 1000,
};

export const toSmallestUnit = (amount: number, currency: Currency): bigint => {
  const multiplier = SUBUNIT_MULTIPLIER[currency];
  return BigInt(Math.round(amount * multiplier));
};

export const toMajorUnit = (amount: bigint, currency: Currency): number => {
  const multiplier = SUBUNIT_MULTIPLIER[currency];
  return Number(amount) / multiplier;
};
