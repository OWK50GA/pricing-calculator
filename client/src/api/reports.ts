import { api } from "./client";

export type PeriodSummaryRow = {
  currency:      string;
  documentCount: number;
  subTotal:      number;
  totalDiscount: number;
  totalTax:      number;
  grandTotal:    number;
};

export type PeriodSummaryResponse = {
  period:       { from: string; to: string };
  statusFilter: "DRAFT" | "FINALIZED";
  data:         PeriodSummaryRow[];
};

export const reportsApi = {
  summary: (from: string, to: string, status: "DRAFT" | "FINALIZED" = "FINALIZED") =>
    api.get<PeriodSummaryResponse>(
      `/reports/summary?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&status=${status}`,
    ),
};
