import { useState } from "react";
import type { CreateLineItemBody } from "@/api/documents";

type Props = {
  onAdd: (body: CreateLineItemBody) => Promise<void>;
};

const EMPTY = {
  description:   "",
  quantity:      "1",
  unitPrice:     "",
  discountType:  "NONE" as "NONE" | "FIXED" | "PERCENT",
  discountValue: "",
  taxPercent:    "",
};

export function AddLineItemRow({ onAdd }: Props) {
  const [draft,   setDraft]   = useState({ ...EMPTY });
  const [adding,  setAdding]  = useState(false);
  const [visible, setVisible] = useState(false);

  const set = (key: keyof typeof draft) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setDraft((d) => ({ ...d, [key]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.description || !draft.unitPrice) return;
    setAdding(true);
    await onAdd({
      description:   draft.description,
      quantity:      Number(draft.quantity) || 1,
      unitPrice:     Number(draft.unitPrice),
      discountType:  draft.discountType === "NONE" ? undefined : draft.discountType,
      discountValue: draft.discountType !== "NONE" && draft.discountValue ? Number(draft.discountValue) : undefined,
      taxPercent:    draft.taxPercent ? Number(draft.taxPercent) : 0,
    });
    setAdding(false);
    setDraft({ ...EMPTY });
    setVisible(false);
  }

  if (!visible) {
    return (
      <tr>
        <td colSpan={7} className="px-3 py-2">
          <button
            onClick={() => setVisible(true)}
            className="text-sm text-blue-600 hover:underline"
          >
            + Add line item
          </button>
        </td>
      </tr>
    );
  }

  const inputClass =
    "w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

  return (
    <tr className="bg-gray-50 border-b border-gray-200">
      <td className="px-3 py-2">
        <input
          autoFocus
          required
          placeholder="Description"
          className={inputClass}
          value={draft.description}
          onChange={set("description")}
        />
      </td>
      <td className="px-3 py-2 w-20">
        <input
          type="number" min="1" step="1" placeholder="Qty"
          className={inputClass}
          value={draft.quantity}
          onChange={set("quantity")}
        />
      </td>
      <td className="px-3 py-2 w-28">
        <input
          type="number" min="0" step="0.01" placeholder="Unit price"
          className={inputClass}
          value={draft.unitPrice}
          onChange={set("unitPrice")}
        />
      </td>
      <td className="px-3 py-2 w-40">
        <div className="flex gap-1">
          <select
            className="rounded border border-gray-300 px-1 py-1 text-xs focus:outline-none"
            value={draft.discountType}
            onChange={set("discountType")}
          >
            <option value="NONE">None</option>
            <option value="FIXED">Fixed</option>
            <option value="PERCENT">%</option>
          </select>
          {draft.discountType !== "NONE" && (
            <input
              type="number" min="0" step="0.01" placeholder="Value"
              className={`${inputClass} w-20`}
              value={draft.discountValue}
              onChange={set("discountValue")}
            />
          )}
        </div>
      </td>
      <td className="px-3 py-2 w-20">
        <input
          type="number" min="0" max="100" step="0.01" placeholder="%"
          className={inputClass}
          value={draft.taxPercent}
          onChange={set("taxPercent")}
        />
      </td>
      <td className="px-3 py-2 w-28" />
      <td className="px-3 py-2 w-12">
        <div className="flex gap-2">
          <button
            onClick={handleSubmit}
            disabled={adding || !draft.description || !draft.unitPrice}
            className="text-xs font-medium text-blue-600 hover:underline disabled:opacity-40"
          >
            {adding ? "…" : "Add"}
          </button>
          <button
            onClick={() => { setDraft({ ...EMPTY }); setVisible(false); }}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            Cancel
          </button>
        </div>
      </td>
    </tr>
  );
}
