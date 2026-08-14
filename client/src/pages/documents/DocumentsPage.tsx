import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { documentsApi, type Document, type DocumentStatus } from "@/api/documents";
import { Layout } from "@/components/Layout";
import { StatusBadge } from "@/components/StatusBadge";
import { formatCurrency, formatDate } from "@/lib/format";

const STATUS_FILTERS: { label: string; value: DocumentStatus | "ALL" }[] = [
  { label: "All",       value: "ALL" },
  { label: "Drafts",    value: "DRAFT" },
  { label: "Finalized", value: "FINALIZED" },
];

export function DocumentsPage() {
  const navigate     = useNavigate();
  const queryClient  = useQueryClient();
  const [filter, setFilter] = useState<DocumentStatus | "ALL">("ALL");

  const { data, isLoading, error } = useQuery({
    queryKey: ["documents"],
    queryFn:  async () => {
      const res = await documentsApi.list();
      if (res.error) throw new Error(res.error);
      return res.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: () =>
      documentsApi.create({
        title:    "Untitled document",
        customer: "Unknown customer",
        issueDate: new Date().toISOString().slice(0, 10),
      }),
    onSuccess: (res) => {
      if (res.data?.data) {
        queryClient.invalidateQueries({ queryKey: ["documents"] });
        navigate(`/documents/${res.data.data.id}`);
      }
    },
  });

  const documents: Document[] = data?.data ?? [];

  const filtered = filter === "ALL"
    ? documents
    : documents.filter((d) => d.status === filter);

  return (
    <Layout>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Documents</h1>
        <button
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {createMutation.isPending ? "Creating…" : "+ New document"}
        </button>
      </div>

      {/* Status filter tabs */}
      <div className="mb-4 flex gap-1 border-b border-gray-200">
        {STATUS_FILTERS.map(({ label, value }) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              filter === value
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      {isLoading && (
        <p className="text-sm text-gray-500">Loading…</p>
      )}

      {error && (
        <p className="text-sm text-red-600">{(error as Error).message}</p>
      )}

      {!isLoading && filtered.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-300 p-10 text-center">
          <p className="text-sm text-gray-500">No documents yet.</p>
          <button
            onClick={() => createMutation.mutate()}
            className="mt-3 text-sm font-medium text-blue-600 hover:underline"
          >
            Create your first document
          </button>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
          {filtered.map((doc) => (
            <Link
              key={doc.id}
              to={`/documents/${doc.id}`}
              className="flex flex-col gap-1 px-4 py-3 hover:bg-gray-50 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-gray-900">
                  {doc.title || "Untitled"}
                </span>
                <span className="text-xs text-gray-500">
                  {doc.customer || "No customer"} · {formatDate(doc.issueDate)}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <StatusBadge status={doc.status} />
                <span className="text-sm font-medium text-gray-900 tabular-nums">
                  {doc.grandTotal != null
                    ? formatCurrency(doc.grandTotal, doc.currency)
                    : "—"}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </Layout>
  );
}
