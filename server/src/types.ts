declare global {
  namespace Express {
    interface Request {
      user?: { userId: string; role: string };
    }
  }
}

export type UserRole = "admin" | "analyst";

export type User = {
    id: string;
    passwordHash: string;
    username: string;
    email: string | null;
    role: UserRole;
    createdAt: Date;
};

export type Session = {
    id: string;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    revoked: boolean;
    createdAt: Date;
};

export type DocumentStatus = "DRAFT" | "FINALIZED";

export type DiscountType = "PERCENT" | "FIXED";

export type Document = {
  id: string;
  userId: string;
  title: string;
  customer: string;
  issueDate: Date;
  status: DocumentStatus;
  currency: string;
  subtotal:      number | null;
  totalDiscount: number | null;
  totalTax:      number | null;
  grandTotal:    number | null;
  createdAt: Date;
  updatedAt: Date;
};

export type DocumentResult = {
  subTotal: number;
  totalDiscount: number;
  totalTax: number;
  grandTotal: number;
};

export type LineItem = {
  id: string;
  documentId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discountType?: DiscountType;
  discountValue?: number;
  taxPercent: number;
  lineTotal?: number; // stored after creation; undefined on optimistic client rows
};

export type LineItemResult = {
  subTotal: number;
  discountAmount: number;
  afterDiscount: number;
  taxAmount: number;
  lineTotal: number;
};
