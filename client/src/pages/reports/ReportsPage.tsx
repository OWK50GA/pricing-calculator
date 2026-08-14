import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { reportsApi, type PeriodSummaryRow } from "@/api/reports";
import { Layout }          from "@/components/Layout";
import { formatCurrency }  from "@/lib/format";
import { CURRENCY_LABELS } from "@/lib/currency";

// Default range: first day of current month → today
function defaultFrom() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function defaultTo() {
  return new Date().toISOString().slice(0, 10);
}

type StatusFilter = "FINALIZED" | "DRAFT";

export function ReportsPage() {
  const [from,   setFrom]   = useState(defaultFrom());
  const [to,     setTo]     = useState(defaultTo());
  const [status, setStatus] = useState<StatusFilter>("FINALIZED");
  const [submitted, setSubmitted] = useState(false);
  const [query, setQuery]   = useState({ from: defaultFrom(), to: defaultTo(), status: "FINALIZED" as StatusFilter });

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ["reports", "summary", query.from, query.to, query.status],
    queryFn:  async () => {
      const res = await reportsApi.summary(query.from, query.to, query.status);
      if (res.error) throw new Error(res.error);
      return res.data!;
    },
    enabled: submitted,
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!from || !to) return;
    setQuery({ from, to, status });
    setSubmitted(true);
  }

  const rows: PeriodSummaryRow[] = data?.data ?? [];
  const totalDocs    = rows.reduce((s, r) => s + r.documentCount, 0);

  const inputClass =
    "rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

  return (
    <Layout>
      <h1 className="mb-6 text-xl font-semibold text-gray-900">Summary report</h1>

      {/* Filter form */}
      <form onSubmit={handleSubmit} className="mb-6 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
          <input
            type="date"
            required
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
          <input
            type="date"
            required
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            className={inputClass}
          >
            <option value="FINALIZED">Finalized</option>
            <option value="DRAFT">Draft</option>
          </select>
        </div>

        <button
          type="submit"
          disabled={isLoading || isFetching}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {isFetching ? "Loading…" : "Run report"}
        </button>
      </form>

      {/* Error */}
      {error && (
        <p className="text-sm text-red-600 mb-4">{(error as Error).message}</p>
      )}

      {/* No results yet */}
      {submitted && !isLoading && !isFetching && rows.length === 0 && !error && (
        <div className="rounded-lg border border-dashed border-gray-300 p-10 text-center">
          <p className="text-sm text-gray-500">
            No {status.toLowerCase()} documents in this date range.
          </p>
        </div>
      )}

      {/* Results */}
      {rows.length > 0 && (
        <>
          {/* Summary bar */}
          <div className="mb-4 flex flex-wrap gap-4 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm">
            <Stat label="Documents" value={String(totalDocs)} />
            <Stat label="Period" value={`${query.from} → ${query.to}`} />
            <Stat label="Status" value={query.status === "FINALIZED" ? "Finalized" : "Draft"} />
          </div>

          {/* Per-currency table */}
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="w-full min-w-[520px] border-collapse text-left">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs font-medium text-gray-500">
                <tr>
                  <th className="px-4 py-2">Currency</th>
                  <th className="px-4 py-2 text-right">Docs</th>
                  <th className="px-4 py-2 text-right">Subtotal</th>
                  <th className="px-4 py-2 text-right">Discount</th>
                  <th className="px-4 py-2 text-right">Tax</th>
                  <th className="px-4 py-2 text-right font-semibold text-gray-700">Grand total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row) => (
                  <tr key={row.currency} className="text-sm">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {CURRENCY_LABELS[row.currency] ?? row.currency.toUpperCase()}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                      {row.documentCount}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                      {formatCurrency(row.subTotal, row.currency)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-green-700">
                      {row.totalDiscount > 0 ? `−${formatCurrency(row.totalDiscount, row.currency)}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                      {row.totalTax > 0 ? formatCurrency(row.totalTax, row.currency) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900">
                      {formatCurrency(row.grandTotal, row.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Layout>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-gray-500">{label}: </span>
      <span className="font-medium text-gray-900">{value}</span>
    </div>
  );
}
