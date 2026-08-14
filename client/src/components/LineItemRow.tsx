import { useRef, useState } from "react";
import type { LineItem, CreateLineItemBody } from "@/api/documents";
import { formatCurrency } from "@/lib/format";
import { calculateLineFromMajorUnits } from "@pricing-calc/calculator";
import type { Currency } from "@pricing-calc/calculator";

type Props = {
  item:       LineItem;
  currency:   string;
  readOnly:   boolean;
  onSave:     (id: string, patch: Partial<CreateLineItemBody>) => Promise<void>;
  onDelete:   (id: string) => Promise<void>;
};

type Draft = {
  description:   string;
  quantity:      string;
  unitPrice:     string;
  discountType:  "NONE" | "FIXED" | "PERCENT";
  discountValue: string;
  taxPercent:    string;
};

function toDraft(item: LineItem): Draft {
  return {
    description:   item.description,
    quantity:      String(item.quantity),
    unitPrice:     String(item.unitPrice),
    discountType:  (item.discountType ?? "NONE") as Draft["discountType"],
    discountValue: String(item.discountValue ?? ""),
    taxPercent:    String(item.taxPercent ?? ""),
  };
}

function toSaveBody(d: Draft): Partial<CreateLineItemBody> {
  return {
    description:   d.description,
    quantity:      Number(d.quantity),
    unitPrice:     Number(d.unitPrice),
    discountType:  d.discountType === "NONE" ? undefined : d.discountType,
    discountValue: d.discountType !== "NONE" && d.discountValue ? Number(d.discountValue) : undefined,
    taxPercent:    d.taxPercent ? Number(d.taxPercent) : 0,
  };
}

export function LineItemRow({ item, currency, readOnly, onSave, onDelete }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState<Draft>(toDraft(item));
  const [saving,  setSaving]  = useState(false);
  const rowRef = useRef<HTMLTableRowElement>(null);

  // Live line total for the current draft values
  const liveResult = (() => {
    const q  = Number(draft.quantity)  || 0;
    const up = Number(draft.unitPrice) || 0;
    const dt = draft.discountType === "NONE" ? null : draft.discountType;
    const dv = dt && draft.discountValue ? Number(draft.discountValue) : null;
    const tp = draft.taxPercent ? Number(draft.taxPercent) : null;
    return calculateLineFromMajorUnits(q, up, dt, dv, tp, currency as Currency);
  })();

  function startEdit() {
    if (readOnly) return;
    setDraft(toDraft(item));
    setEditing(true);
  }

  async function commitSave() {
    if (!editing) return;
    setSaving(true);
    await onSave(item.id, toSaveBody(draft));
    setSaving(false);
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setDraft(toDraft(item));
      setEditing(false);
    }
    if (e.key === "Enter") {
      e.preventDefault();
      commitSave();
    }
  }

  const cellClass = "px-3 py-2 text-sm align-middle";
  const inputClass =
    "w-full rounded border border-blue-400 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500";

  const set = (key: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setDraft((d) => ({ ...d, [key]: e.target.value }));

  return (
    <tr
      ref={rowRef}
      onClick={!editing ? startEdit : undefined}
      onKeyDown={handleKeyDown}
      className={`border-b border-gray-100 last:border-0 ${
        !readOnly && !editing ? "cursor-pointer hover:bg-gray-50" : ""
      } ${editing ? "bg-blue-50" : ""}`}
    >
      {/* Description */}
      <td className={cellClass}>
        {editing ? (
          <input
            autoFocus
            className={inputClass}
            value={draft.description}
            onChange={set("description")}
            onBlur={commitSave}
          />
        ) : (
          <span className="text-gray-900">{item.description || <span className="text-gray-400">—</span>}</span>
        )}
      </td>

      {/* Quantity */}
      <td className={`${cellClass} w-20`}>
        {editing ? (
          <input
            type="number"
            min="1"
            step="1"
            className={inputClass}
            value={draft.quantity}
            onChange={set("quantity")}
            onBlur={commitSave}
          />
        ) : (
          <span className="tabular-nums text-gray-700">{item.quantity}</span>
        )}
      </td>

      {/* Unit price */}
      <td className={`${cellClass} w-28`}>
        {editing ? (
          <input
            type="number"
            min="0"
            step="0.01"
            className={inputClass}
            value={draft.unitPrice}
            onChange={set("unitPrice")}
            onBlur={commitSave}
          />
        ) : (
          <span className="tabular-nums text-gray-700">
            {formatCurrency(item.unitPrice, currency)}
          </span>
        )}
      </td>

      {/* Discount */}
      <td className={`${cellClass} w-40`}>
        {editing ? (
          <div className="flex gap-1">
            <select
              className="rounded border border-blue-400 px-1 py-1 text-xs focus:outline-none"
              value={draft.discountType}
              onChange={set("discountType")}
            >
              <option value="NONE">None</option>
              <option value="FIXED">Fixed</option>
              <option value="PERCENT">%</option>
            </select>
            {draft.discountType !== "NONE" && (
              <input
                type="number"
                min="0"
                step="0.01"
                className={`${inputClass} w-20`}
                value={draft.discountValue}
                onChange={set("discountValue")}
                onBlur={commitSave}
              />
            )}
          </div>
        ) : (
          <span className="text-gray-700 text-xs">
            {item.discountType && item.discountValue
              ? item.discountType === "PERCENT"
                ? `${item.discountValue}%`
                : formatCurrency(item.discountValue, currency)
              : "—"}
          </span>
        )}
      </td>

      {/* Tax */}
      <td className={`${cellClass} w-20`}>
        {editing ? (
          <input
            type="number"
            min="0"
            max="100"
            step="0.01"
            className={inputClass}
            value={draft.taxPercent}
            onChange={set("taxPercent")}
            onBlur={commitSave}
            placeholder="%"
          />
        ) : (
          <span className="tabular-nums text-gray-700 text-xs">
            {item.taxPercent ? `${item.taxPercent}%` : "—"}
          </span>
        )}
      </td>

      {/* Line total */}
      <td className={`${cellClass} w-28 text-right`}>
        <span className={`tabular-nums font-medium ${editing ? "text-blue-700" : "text-gray-900"}`}>
          {formatCurrency(editing ? liveResult.lineTotal : (item as LineItem & { lineTotal?: number }).lineTotal ?? liveResult.lineTotal, currency)}
        </span>
      </td>

      {/* Actions */}
      {!readOnly && (
        <td className={`${cellClass} w-12 text-right`}>
          {editing ? (
            <button
              onClick={(e) => { e.stopPropagation(); commitSave(); }}
              disabled={saving}
              className="text-xs text-blue-600 hover:underline"
            >
              {saving ? "…" : "Save"}
            </button>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
              className="text-xs text-red-400 hover:text-red-600"
              aria-label="Delete line item"
            >
              ✕
            </button>
          )}
        </td>
      )}
    </tr>
  );
}
