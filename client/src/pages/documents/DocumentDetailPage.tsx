import { useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { documentsApi, type CreateLineItemBody } from "@/api/documents";
import { Layout }         from "@/components/Layout";
import { StatusBadge }    from "@/components/StatusBadge";
import { TotalsPanel }    from "@/components/TotalsPanel";
import { LineItemRow }    from "@/components/LineItemRow";
import { AddLineItemRow } from "@/components/AddLineItemRow";
import { useLiveTotals }  from "@/hooks/useLiveTotals";
import { formatDate }     from "@/lib/format";
import { CURRENCY_LABELS } from "@/lib/currency";

export function DocumentDetailPage() {
  const { id }       = useParams<{ id: string }>();
  const navigate     = useNavigate();
  const queryClient  = useQueryClient();

  // Meta edit state
  const [editingMeta, setEditingMeta]   = useState(false);
  const [metaTitle,   setMetaTitle]     = useState("");
  const [metaCustomer, setMetaCustomer] = useState("");
  const [metaDate,    setMetaDate]      = useState("");
  const [finalizeConfirm, setFinalizeConfirm] = useState(false);
  const [metaError,   setMetaError]     = useState<string | null>(null);

  const { data: doc, isLoading, error } = useQuery({
    queryKey: ["document", id],
    queryFn:  async () => {
      const res = await documentsApi.get(id!);
      if (res.error) throw new Error(res.error);
      return res.data!.data;
    },
    enabled: !!id,
  });

  const liveTotals = useLiveTotals(doc?.lineItems ?? [], doc?.currency ?? "usd");

  const isReadOnly = doc?.status === "FINALIZED";

  // ── Meta save ──────────────────────────────────────────────────────────────
  const updateMeta = useMutation({
    mutationFn: (body: { title: string; customer: string; issueDate: string }) =>
      documentsApi.update(id!, body),
    onSuccess: (res) => {
      if (res.error) { setMetaError(res.error); return; }
      queryClient.invalidateQueries({ queryKey: ["document", id] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      setEditingMeta(false);
    },  });

  function openMetaEdit() {
    if (!doc) return;
    setMetaTitle(doc.title);
    setMetaCustomer(doc.customer);
    setMetaDate(doc.issueDate?.slice(0, 10) ?? "");
    setMetaError(null);
    setEditingMeta(true);
  }

  function saveMeta() {
    updateMeta.mutate({ title: metaTitle, customer: metaCustomer, issueDate: metaDate });
  }

  // ── Line items ─────────────────────────────────────────────────────────────
  const addLine = useMutation({
    mutationFn: (body: CreateLineItemBody) => documentsApi.addLineItem(id!, body),
    onSuccess:  () => queryClient.invalidateQueries({ queryKey: ["document", id] }),
  });

  const updateLine = useMutation({
    mutationFn: ({ lineId, patch }: { lineId: string; patch: Partial<CreateLineItemBody> }) =>
      documentsApi.updateLineItem(id!, lineId, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["document", id] }),
  });

  const deleteLine = useMutation({
    mutationFn: (lineId: string) => documentsApi.deleteLineItem(id!, lineId),
    onSuccess:  () => queryClient.invalidateQueries({ queryKey: ["document", id] }),
  });

  // ── Finalize ───────────────────────────────────────────────────────────────
  const finalize = useMutation({
    mutationFn: () => documentsApi.finalize(id!),
    onSuccess: (res) => {
      if (res.error) { alert(res.error); return; }
      queryClient.invalidateQueries({ queryKey: ["document", id] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      setFinalizeConfirm(false);
    },
  });

  // ── Delete document ────────────────────────────────────────────────────────
  const deleteDoc = useMutation({
    mutationFn: () => documentsApi.delete(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      navigate("/documents");
    },
  });

  // ── Render ─────────────────────────────────────────────────────────────────
  if (isLoading) {
    return <Layout><p className="text-sm text-gray-500">Loading…</p></Layout>;
  }
  if (error || !doc) {
    return (
      <Layout>
        <p className="text-sm text-red-600">{(error as Error)?.message ?? "Document not found"}</p>
        <Link to="/documents" className="text-sm text-blue-600 hover:underline">← Back</Link>
      </Layout>
    );
  }

  const serverTotals = {
    subTotal:      doc.subtotal      ?? 0,
    totalDiscount: doc.totalDiscount ?? 0,
    totalTax:      doc.totalTax      ?? 0,
    grandTotal:    doc.grandTotal    ?? 0,
  };

  // Show live (client) totals for drafts, server totals for finalized
  const displayTotals = isReadOnly ? serverTotals : liveTotals;

  return (
    <Layout>
      {/* Back + status */}
      <div className="mb-4 flex items-center justify-between">
        <Link to="/documents" className="text-sm text-gray-500 hover:text-gray-900">
          ← Documents
        </Link>
        <StatusBadge status={doc.status} />
      </div>

      {/* Document meta */}
      <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4">
        {editingMeta ? (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
              <input
                className="block w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={metaTitle}
                onChange={(e) => setMetaTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Customer</label>
              <input
                className="block w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={metaCustomer}
                onChange={(e) => setMetaCustomer(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Issue date</label>
              <input
                type="date"
                className="block w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={metaDate}
                onChange={(e) => setMetaDate(e.target.value)}
              />
            </div>
            {metaError && <p className="text-xs text-red-600">{metaError}</p>}
            <div className="flex gap-2">
              <button
                onClick={saveMeta}
                disabled={updateMeta.isPending}
                className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {updateMeta.isPending ? "Saving…" : "Save"}
              </button>
              <button
                onClick={() => setEditingMeta(false)}
                className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-lg font-semibold text-gray-900">
                {doc.title || <span className="text-gray-400">Untitled</span>}
              </h1>
              <p className="mt-0.5 text-sm text-gray-500">
                {doc.customer || <span className="text-gray-400">No customer</span>}
                {" · "}
                {formatDate(doc.issueDate)}
                {" · "}
                <span className="uppercase text-xs">{CURRENCY_LABELS[doc.currency] ?? doc.currency}</span>
              </p>
            </div>
            {!isReadOnly && (
              <button
                onClick={openMetaEdit}
                className="shrink-0 text-xs text-gray-500 hover:text-gray-900"
              >
                Edit
              </button>
            )}
          </div>
        )}
      </div>

      {/* Two-column layout: line items | totals */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">

        {/* Line items table */}
        <div className="flex-1 overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full min-w-[600px] border-collapse text-left">
            <thead className="border-b border-gray-200 bg-gray-50 text-xs font-medium text-gray-500">
              <tr>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2 w-20">Qty</th>
                <th className="px-3 py-2 w-28">Unit price</th>
                <th className="px-3 py-2 w-40">Discount</th>
                <th className="px-3 py-2 w-20">Tax</th>
                <th className="px-3 py-2 w-28 text-right">Total</th>
                {!isReadOnly && <th className="px-3 py-2 w-12" />}
              </tr>
            </thead>
            <tbody>
              {doc.lineItems.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-sm text-gray-400">
                    No line items yet
                  </td>
                </tr>
              )}
              {doc.lineItems.map((item) => (
                <LineItemRow
                  key={item.id}
                  item={item}
                  currency={doc.currency}
                  readOnly={isReadOnly}
                  onSave={async (lineId, patch) => {
                    await updateLine.mutateAsync({ lineId, patch });
                  }}
                  onDelete={async (lineId) => {
                    await deleteLine.mutateAsync(lineId);
                  }}
                />
              ))}
              {!isReadOnly && (
                <AddLineItemRow
                  onAdd={async (body) => { await addLine.mutateAsync(body); }}
                />
              )}
            </tbody>
          </table>
        </div>

        {/* Totals + actions */}
        <div className="w-full lg:w-72 space-y-4">
          <TotalsPanel
            totals={displayTotals}
            currency={doc.currency}
            isLive={!isReadOnly}
          />

          {!isReadOnly && (
            <div className="space-y-2">
              {/* Finalize */}
              {!finalizeConfirm ? (
                <button
                  onClick={() => setFinalizeConfirm(true)}
                  disabled={doc.lineItems.length === 0}
                  className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
                >
                  Finalize document
                </button>
              ) : (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-2">
                  <p className="text-xs text-blue-800">
                    This will lock the document. Grand total:{" "}
                    <strong>{new Intl.NumberFormat("en-US", { style: "currency", currency: doc.currency.toUpperCase() }).format(liveTotals.grandTotal)}</strong>.
                    No further edits will be possible.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => finalize.mutate()}
                      disabled={finalize.isPending}
                      className="flex-1 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {finalize.isPending ? "Finalizing…" : "Confirm"}
                    </button>
                    <button
                      onClick={() => setFinalizeConfirm(false)}
                      className="flex-1 rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Delete draft */}
              <button
                onClick={() => {
                  if (confirm("Delete this draft document?")) deleteDoc.mutate();
                }}
                disabled={deleteDoc.isPending}
                className="w-full rounded-md border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
              >
                Delete draft
              </button>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
