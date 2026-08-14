export type DiscountType = "PERCENT" | "FIXED";

export type LineItem = {
  id: string;
  documentId: string;
  description: string;
  quantity: number;
  unitPrice: number; // major units (e.g. dollars, naira)
  discountType?: DiscountType;
  discountValue?: number;
  taxPercent: number;
};

export type LineItemResult = {
  subTotal: number;
  discountAmount: number;
  afterDiscount: number;
  taxAmount: number;
  lineTotal: number;
};

export type DocumentResult = {
  subTotal: number;
  totalDiscount: number;
  totalTax: number;
  grandTotal: number;
};

export type DocumentBigIntResult = {
  subTotal: bigint;
  totalDiscount: bigint;
  totalTax: bigint;
  grandTotal: bigint;
};
