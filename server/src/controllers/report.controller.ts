import { Request, Response } from "express";
import { getDocumentPeriodSummary, getUserById } from "../db/db.js";

/**
 * GET /reports/summary?from=YYYY-MM-DD&to=YYYY-MM-DD&status=DRAFT|FINALIZED
 *
 * Returns aggregated totals for the authenticated user's documents within a
 * date range, grouped by currency. Defaults to FINALIZED documents only.
 */
export async function getPeriodSummary(req: Request, res: Response) {
    const requestUser = req.user;
    if (!requestUser) {
        return res.status(401).json({ status: "error", message: "Unauthorized" });
    }

    const user = await getUserById(requestUser.userId);
    if (!user) {
        return res.status(401).json({ status: "error", message: "Unauthorized" });
    }

    const { from, to, status } = req.query;

    if (!from || !to) {
        return res.status(400).json({ status: "error", message: "from and to query parameters are required" });
    }

    const fromDate = new Date(from as string);
    const toDate   = new Date(to as string);

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
        return res.status(422).json({ status: "error", message: "from and to must be valid ISO date strings" });
    }
    if (fromDate > toDate) {
        return res.status(422).json({ status: "error", message: "from must be before or equal to to" });
    }

    const allowedStatuses = ["DRAFT", "FINALIZED"] as const;
    const statusFilter: "DRAFT" | "FINALIZED" = (
        typeof status === "string" && (allowedStatuses as readonly string[]).includes(status.toUpperCase())
            ? status.toUpperCase() as "DRAFT" | "FINALIZED"
            : "FINALIZED"
    );

    try {
        const data = await getDocumentPeriodSummary({
            userId: user.id,
            from:   fromDate,
            to:     toDate,
            status: statusFilter,
        });

        return res.status(200).json({
            status: "success",
            period: { from: fromDate.toISOString(), to: toDate.toISOString() },
            statusFilter,
            data,
        });
    } catch {
        return res.status(500).json({ status: "error", message: "Internal server error" });
    }
}
