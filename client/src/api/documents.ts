import { api } from "./client";

export type DocumentStatus = "DRAFT" | "FINALIZED";

export type Document = {
  id:         string;
  userId:     string;
  title:      string;
  customer:   string;
  issueDate:  string;
  status:     DocumentStatus;
  currency:   string;
  subtotal:       number | null;
  totalDiscount:  number | null;
  totalTax:       number | null;
  grandTotal:     number | null;
  createdAt:  string;
  updatedAt:  string;
};

export type LineItem = {
  id:            string;
  documentId:    string;
  description:   string;
  quantity:      number;
  unitPrice:     number;
  discountType?: "FIXED" | "PERCENT";
  discountValue?: number;
  taxPercent:    number;
  lineTotal?:    number;
};

export type DocumentWithLines = Document & { lineItems: LineItem[] };

export type CreateDocumentBody = {
  title:      string;
  customer:   string;
  issueDate?: string;
  currency?:  string;
};

export type UpdateDocumentBody = Partial<Pick<CreateDocumentBody, "title" | "customer" | "issueDate">>;

export type CreateLineItemBody = {
  description:   string;
  quantity:      number;
  unitPrice:     number;
  discountType?: "FIXED" | "PERCENT";
  discountValue?: number;
  taxPercent?:   number;
};

type ServerResponse<T> = { status: string; data: T; count?: number };

export const documentsApi = {
  list: () =>
    api.get<ServerResponse<Document[]>>("/documents"),

  get: (id: string) =>
    api.get<ServerResponse<DocumentWithLines>>(`/documents/${id}`),

  create: (body: CreateDocumentBody) =>
    api.post<ServerResponse<Document>>("/documents", body),

  update: (id: string, body: UpdateDocumentBody) =>
    api.patch<ServerResponse<Document>>(`/documents/${id}`, body),

  delete: (id: string) =>
    api.delete<void>(`/documents/${id}`),

  finalize: (id: string) =>
    api.post<ServerResponse<Document>>(`/documents/${id}/finalize`, {}),

  addLineItem: (documentId: string, body: CreateLineItemBody) =>
    api.post<ServerResponse<LineItem>>(`/documents/${documentId}/line-items`, body),

  updateLineItem: (documentId: string, lineId: string, body: Partial<CreateLineItemBody>) =>
    api.patch<ServerResponse<LineItem>>(`/documents/${documentId}/line-items/${lineId}`, body),

  deleteLineItem: (documentId: string, lineId: string) =>
    api.delete<void>(`/documents/${documentId}/line-items/${lineId}`),

  batchAddLineItems: (documentId: string, items: CreateLineItemBody[]) =>
    api.post<ServerResponse<LineItem[]>>(
      `/documents/${documentId}/line-items/batch`,
      { items },
    ),
};
