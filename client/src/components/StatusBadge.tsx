import type { DocumentStatus } from "@/api/documents";

const styles: Record<DocumentStatus, string> = {
  DRAFT:     "bg-gray-100 text-gray-700",
  FINALIZED: "bg-green-100 text-green-700",
};

const labels: Record<DocumentStatus, string> = {
  DRAFT:     "Draft",
  FINALIZED: "Finalized",
};

export function StatusBadge({ status }: { status: DocumentStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}
