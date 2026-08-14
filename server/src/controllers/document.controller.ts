import { Request, Response } from "express";
import {
    createDocument,
    createLineItem,
    createLineItemsBatch,
    deleteDocument,
    deleteLineItem as dbDeleteLineItem,
    finalizeDocument as dbFinalizeDocument,
    getDocumentById,
    getLineItemById,
    getLineItemsByDocument,
    getUserById,
    listDocumentsByUser,
    updateDocumentMeta,
    updateLineItem as dbUpdateLineItem,
} from "../db/db.js";
import { aggregateDocumentRaw, calculateLine, toBps } from "../lib/calculator.js";
import { Currency, toSmallestUnit } from "../lib/currency.js";
import type { DiscountType } from "../types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function isValidCurrency(value: string): value is Currency {
    return Object.values(Currency).includes(value as Currency);
}

// Resolve req.user and verify the user record exists.
// Returns the user record or sends an error response and returns null.
async function resolveUser(req: Request, res: Response) {
    const requestUser = req.user;
    if (!requestUser) {
        res.status(401).json({ status: "error", message: "Unauthorized" });
        return null;
    }
    const user = await getUserById(requestUser.userId);
    if (!user) {
        res.status(401).json({ status: "error", message: "Unauthorized" });
        return null;
    }
    return user;
}

// Resolve a document by id and verify it belongs to the requesting user.
async function resolveOwnedDocument(id: string | string[], userId: string, res: Response) {
    const docId = Array.isArray(id) ? id[0] : id;
    const doc = await getDocumentById(docId);
    if (!doc) {
        res.status(404).json({ status: "error", message: "Document not found" });
        return null;
    }
    if (doc.userId !== userId) {
        res.status(403).json({ status: "error", message: "Forbidden" });
        return null;
    }
    return doc;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /documents
// ─────────────────────────────────────────────────────────────────────────────

export async function createDocumentDraft(req: Request, res: Response) {
    const { title, customer, currency, issueDate } = req.body;

    if (!title || !customer) {
        return res.status(400).json({ status: "error", message: "Missing title or customer" });
    }
    if (typeof title !== "string" || typeof customer !== "string") {
        return res.status(422).json({ status: "error", message: "title and customer must be strings" });
    }
    if (currency !== undefined) {
        if (typeof currency !== "string" || !isValidCurrency(currency)) {
            return res.status(422).json({ status: "error", message: `Invalid currency. Valid values: ${Object.values(Currency).join(", ")}` });
        }
    }

    const user = await resolveUser(req, res);
    if (!user) return;

    try {
        const document = await createDocument({
            userId: user.id,
            title,
            customer,
            issueDate: issueDate ? new Date(issueDate) : new Date(),
            ...(currency && { currency }),
        });

        return res.status(201).json({ status: "success", data: document });
    } catch {
        return res.status(500).json({ status: "error", message: "Internal server error" });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /documents
// ─────────────────────────────────────────────────────────────────────────────

export async function listUserDocuments(req: Request, res: Response) {
    const user = await resolveUser(req, res);
    if (!user) return;

    try {
        const documents = await listDocumentsByUser(user.id);
        return res.status(200).json({
            status: "success",
            data: documents,
            count: documents.length,
        });
    } catch {
        return res.status(500).json({ status: "error", message: "Internal server error" });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /documents/:id
// ─────────────────────────────────────────────────────────────────────────────

export async function getUserDocument(req: Request, res: Response) {
    const user = await resolveUser(req, res);
    if (!user) return;

    const doc = await resolveOwnedDocument(req.params.id, user.id, res);
    if (!doc) return;

    try {
        const lineItems = await getLineItemsByDocument(doc.id, doc.currency as Currency);
        return res.status(200).json({
            status: "success",
            data: { ...doc, lineItems },
        });
    } catch {
        return res.status(500).json({ status: "error", message: "Internal server error" });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /documents/:id
// ─────────────────────────────────────────────────────────────────────────────

export async function editDraftDocumentMeta(req: Request, res: Response) {
    const { title, customer, issueDate } = req.body;

    // At least one field must be present
    if (!title && !customer && !issueDate) {
        return res.status(400).json({ status: "error", message: "Nothing to update" });
    }
    if (title !== undefined && typeof title !== "string") {
        return res.status(422).json({ status: "error", message: "title must be a string" });
    }
    if (customer !== undefined && typeof customer !== "string") {
        return res.status(422).json({ status: "error", message: "customer must be a string" });
    }

    const user = await resolveUser(req, res);
    if (!user) return;

    const doc = await resolveOwnedDocument(req.params.id, user.id, res);
    if (!doc) return;

    if (doc.status !== "DRAFT") {
        return res.status(409).json({ status: "error", message: "Only DRAFT documents can be edited" });
    }

    try {
        const updated = await updateDocumentMeta(doc.id, {
            ...(title    && { title }),
            ...(customer && { customer }),
            ...(issueDate && { issueDate: new Date(issueDate) }),
        });

        // updateDocumentMeta returns null if the document was not DRAFT — shouldn't
        // happen since we checked above, but guard anyway
        if (!updated) {
            return res.status(409).json({ status: "error", message: "Document could not be updated" });
        }

        return res.status(200).json({ status: "success", data: updated });
    } catch {
        return res.status(500).json({ status: "error", message: "Internal server error" });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /documents/:id
// ─────────────────────────────────────────────────────────────────────────────

export async function deleteDocumentDraft(req: Request, res: Response) {
    const user = await resolveUser(req, res);
    if (!user) return;

    const doc = await resolveOwnedDocument(req.params.id, user.id, res);
    if (!doc) return;

    if (doc.status !== "DRAFT") {
        return res.status(409).json({ status: "error", message: "Only DRAFT documents can be deleted" });
    }

    try {
        await deleteDocument(doc.id);
        return res.status(200).json({ status: "success", message: "Document deleted" });
    } catch {
        return res.status(500).json({ status: "error", message: "Internal server error" });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /documents/:id/finalize
// Fetches the document + all line items, recomputes totals using calculator.ts,
// then writes them to the DB atomically alongside the status change.
// ─────────────────────────────────────────────────────────────────────────────

export async function finalizeDocument(req: Request, res: Response) {
    const user = await resolveUser(req, res);
    if (!user) return;

    const doc = await resolveOwnedDocument(req.params.id, user.id, res);
    if (!doc) return;

    if (doc.status !== "DRAFT") {
        return res.status(409).json({ status: "error", message: "Document is already finalized" });
    }

    try {
        const lineItems = await getLineItemsByDocument(doc.id, doc.currency as Currency);

        if (lineItems.length === 0) {
            return res.status(422).json({ status: "error", message: "Cannot finalize a document with no line items" });
        }

        if (!isValidCurrency(doc.currency)) {
            return res.status(500).json({ status: "error", message: "Document has an invalid currency — cannot compute totals" });
        }

        const currency = doc.currency as Currency;

        // aggregateDocumentRaw returns BigInts directly — no round-trip through major units
        const totals = aggregateDocumentRaw(lineItems, currency);

        const finalized = await dbFinalizeDocument(doc.id, totals);

        if (!finalized) {
            return res.status(409).json({ status: "error", message: "Document could not be finalized" });
        }

        return res.status(200).json({ status: "success", data: finalized });
    } catch {
        return res.status(500).json({ status: "error", message: "Internal server error" });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared: parse and compute a line item from request body fields.
// Returns the DB-ready input or sends a 4xx and returns null.
// ─────────────────────────────────────────────────────────────────────────────

type LineItemBody = {
    description: string;
    quantity: number;
    unitPrice: number;
    discountType?: DiscountType;
    discountValue?: number;
    taxPercent?: number;
};

function parseLineItemBody(body: Record<string, unknown>, res: Response): LineItemBody | null {
    const { description, quantity, unitPrice, discountType, discountValue, taxPercent } = body;

    if (!description || quantity == null || unitPrice == null) {
        res.status(400).json({ status: "error", message: "description, quantity and unitPrice are required" });
        return null;
    }
    if (typeof description !== "string") {
        res.status(422).json({ status: "error", message: "description must be a string" });
        return null;
    }
    if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1) {
        res.status(422).json({ status: "error", message: "quantity must be a positive integer" });
        return null;
    }
    if (typeof unitPrice !== "number" || unitPrice < 0) {
        res.status(422).json({ status: "error", message: "unitPrice must be a non-negative number" });
        return null;
    }
    if (discountType !== undefined && discountType !== "FIXED" && discountType !== "PERCENT") {
        res.status(422).json({ status: "error", message: "discountType must be FIXED or PERCENT" });
        return null;
    }
    if (discountType && (discountValue == null || typeof discountValue !== "number" || discountValue < 0)) {
        res.status(422).json({ status: "error", message: "discountValue is required and must be non-negative when discountType is set" });
        return null;
    }
    if (taxPercent !== undefined && (typeof taxPercent !== "number" || taxPercent < 0 || taxPercent > 100)) {
        res.status(422).json({ status: "error", message: "taxPercent must be a number between 0 and 100" });
        return null;
    }

    return {
        description,
        quantity,
        unitPrice,
        discountType: discountType as DiscountType | undefined,
        discountValue: discountValue as number | undefined,
        taxPercent: taxPercent as number | undefined,
    };
}

function computeLineItemInput(
    documentId: string,
    body: LineItemBody,
    currency: Currency,
) {
    const discountType  = body.discountType  ?? null;
    const discountValue = body.discountValue ?? null;
    const taxPercent    = body.taxPercent    ?? null;

    // Convert to smallest unit only for the calculation — not stored
    const unitPriceSmallest = toSmallestUnit(body.unitPrice, currency);

    let discountInternal: bigint | null = null;
    if (discountType === "FIXED" && discountValue !== null) {
        discountInternal = toSmallestUnit(discountValue, currency);
    } else if (discountType === "PERCENT" && discountValue !== null) {
        discountInternal = toBps(discountValue);
    }

    const {
        subTotal,
        discountAmount,
        afterDiscount,
        taxAmount,
        lineTotal,
    } = calculateLine(body.quantity, unitPriceSmallest, discountType, discountInternal, taxPercent);

    return {
        documentId,
        description:    body.description,
        quantity:       body.quantity,
        // Store user-facing values (major units, plain percent) — not internal units
        unitPrice:      body.unitPrice,
        discountType,
        discountValue,
        taxPercent,
        // Store pre-computed BigInt totals so reports can read them without recalculating
        subtotal:       subTotal,
        discountAmount,
        afterDiscount,
        taxAmount,
        lineTotal,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /documents/:id/line-items
// ─────────────────────────────────────────────────────────────────────────────

export async function addLineItem(req: Request, res: Response) {
    const user = await resolveUser(req, res);
    if (!user) return;

    const doc = await resolveOwnedDocument(req.params.id, user.id, res);
    if (!doc) return;

    if (doc.status !== "DRAFT") {
        return res.status(409).json({ status: "error", message: "Cannot add line items to a finalized document" });
    }
    if (!isValidCurrency(doc.currency)) {
        return res.status(500).json({ status: "error", message: "Document has an invalid currency" });
    }

    const body = parseLineItemBody(req.body, res);
    if (!body) return;

    try {
        const input = computeLineItemInput(doc.id, body, doc.currency as Currency);
        const lineItem = await createLineItem(input);
        return res.status(201).json({ status: "success", data: lineItem });
    } catch {
        return res.status(500).json({ status: "error", message: "Internal server error" });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /documents/:id/line-items/batch
// ─────────────────────────────────────────────────────────────────────────────

export async function batchAddLineItems(req: Request, res: Response) {
    const user = await resolveUser(req, res);
    if (!user) return;

    const doc = await resolveOwnedDocument(req.params.id, user.id, res);
    if (!doc) return;

    if (doc.status !== "DRAFT") {
        return res.status(409).json({ status: "error", message: "Cannot add line items to a finalized document" });
    }
    if (!isValidCurrency(doc.currency)) {
        return res.status(500).json({ status: "error", message: "Document has an invalid currency" });
    }

    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ status: "error", message: "items must be a non-empty array" });
    }

    // Validate all items before touching the DB — fail fast, all-or-nothing
    const parsed: LineItemBody[] = [];
    for (let i = 0; i < items.length; i++) {
        const body = parseLineItemBody(items[i], res);
        if (!body) return; // parseLineItemBody already sent the error response
        parsed.push(body);
    }

    try {
        const currency = doc.currency as Currency;
        const inputs = parsed.map(body => computeLineItemInput(doc.id, body, currency));
        const lineItems = await createLineItemsBatch(inputs);
        return res.status(201).json({ status: "success", data: lineItems, count: lineItems.length });
    } catch {
        return res.status(500).json({ status: "error", message: "Internal server error" });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /documents/:id/line-items/:lineId
// ─────────────────────────────────────────────────────────────────────────────

export async function editLineItem(req: Request, res: Response) {
    const user = await resolveUser(req, res);
    if (!user) return;

    const doc = await resolveOwnedDocument(req.params.id, user.id, res);
    if (!doc) return;

    if (doc.status !== "DRAFT") {
        return res.status(409).json({ status: "error", message: "Cannot edit line items on a finalized document" });
    }
    if (!isValidCurrency(doc.currency)) {
        return res.status(500).json({ status: "error", message: "Document has an invalid currency" });
    }

    const lineId = Array.isArray(req.params.lineId) ? req.params.lineId[0] : req.params.lineId;
    const existingLine = await getLineItemById(lineId);
    if (!existingLine) {
        return res.status(404).json({ status: "error", message: "Line item not found" });
    }
    if (existingLine.documentId !== doc.id) {
        return res.status(403).json({ status: "error", message: "Line item does not belong to this document" });
    }

    // Merge incoming fields over the existing line, then recompute
    const merged: LineItemBody = {
        description:   typeof req.body.description === "string"  ? req.body.description  : existingLine.description,
        quantity:      typeof req.body.quantity    === "number"   ? req.body.quantity     : existingLine.quantity,
        unitPrice:     typeof req.body.unitPrice   === "number"   ? req.body.unitPrice    : existingLine.unitPrice,
        discountType:  "discountType"  in req.body ? req.body.discountType  : existingLine.discountType,
        discountValue: "discountValue" in req.body ? req.body.discountValue : existingLine.discountValue,
        taxPercent:    "taxPercent"    in req.body ? req.body.taxPercent    : existingLine.taxPercent,
    };

    // Validate the merged state
    const validated = parseLineItemBody(merged as Record<string, unknown>, res);
    if (!validated) return;

    try {
        const currency = doc.currency as Currency;
        const input = computeLineItemInput(doc.id, validated, currency);
        const updated = await dbUpdateLineItem(lineId, input);
        return res.status(200).json({ status: "success", data: updated });
    } catch {
        return res.status(500).json({ status: "error", message: "Internal server error" });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /documents/:id/line-items/:lineId
// ─────────────────────────────────────────────────────────────────────────────

export async function deleteLineItem(req: Request, res: Response) {
    const user = await resolveUser(req, res);
    if (!user) return;

    const doc = await resolveOwnedDocument(req.params.id, user.id, res);
    if (!doc) return;

    if (doc.status !== "DRAFT") {
        return res.status(409).json({ status: "error", message: "Cannot delete line items from a finalized document" });
    }

    const lineId = Array.isArray(req.params.lineId) ? req.params.lineId[0] : req.params.lineId;
    const existingLine = await getLineItemById(lineId);
    if (!existingLine) {
        return res.status(404).json({ status: "error", message: "Line item not found" });
    }
    if (existingLine.documentId !== doc.id) {
        return res.status(403).json({ status: "error", message: "Line item does not belong to this document" });
    }

    try {
        await dbDeleteLineItem(lineId);
        return res.status(200).json({ status: "success", message: "Line item deleted" });
    } catch {
        return res.status(500).json({ status: "error", message: "Internal server error" });
    }
}
