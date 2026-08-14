import "dotenv/config";
import pg from "pg";
import type {
    User,
    Session,
    Document,
    DocumentStatus,
    LineItem,
    DiscountType,
} from "../types.js";
import { Currency, toMajorUnit } from "../lib/currency.js";

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is not set");
}

export const pool = new Pool({
    connectionString: DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
});

// Low-level helpers
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    params?: unknown[],
): Promise<pg.QueryResult<T>> {
    return pool.query<T>(text, params);
}

export async function getClient(): Promise<pg.PoolClient> {
    return pool.connect();
}

// ─────────────────────────────────────────────────────────────────────────────
// Row mappers — pg returns snake_case column names; map to camelCase TS types
// ─────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToUser(row: any): User {
    return {
        id:           row.id,
        passwordHash: row.password_hash,
        username:     row.username,
        email:        row.email ?? null,
        role:         row.role,
        createdAt:    row.created_at,
    };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToSession(row: any): Session {
    return {
        id:        row.id,
        userId:    row.user_id,
        tokenHash: row.token_hash,
        expiresAt: row.expires_at,
        revoked:   row.revoked,
        createdAt: row.created_at,
    };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToDocument(row: any): Document {
    const currency = row.currency as Currency;
    const toMajor  = (v: unknown) => v !== null && v !== undefined
        ? toMajorUnit(BigInt(v as string | number), currency)
        : null;
    return {
        id:            row.id,
        userId:        row.user_id,
        title:         row.title,
        customer:      row.customer,
        issueDate:     row.issue_date,
        status:        row.status as DocumentStatus,
        currency:      row.currency,
        subtotal:      toMajor(row.subtotal),
        totalDiscount: toMajor(row.total_discount),
        totalTax:      toMajor(row.total_tax),
        grandTotal:    toMajor(row.grand_total),
        createdAt:     row.created_at,
        updatedAt:     row.updated_at,
    };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToLineItem(row: any, currency?: Currency): LineItem {
    // line_total is stored in smallest unit — convert if currency provided
    const lineTotal = row.line_total !== null && row.line_total !== undefined && currency
        ? toMajorUnit(BigInt(row.line_total), currency)
        : (row.line_total !== null && row.line_total !== undefined ? Number(row.line_total) : undefined);

    return {
        id:            row.id,
        documentId:    row.document_id,
        description:   row.description,
        quantity:      row.quantity,
        unitPrice:     Number(row.unit_price),
        discountType:  row.discount_type as DiscountType | undefined,
        discountValue: row.discount_value !== null ? Number(row.discount_value) : undefined,
        taxPercent:    row.tax_percent !== null ? Number(row.tax_percent) : 0,
        lineTotal,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Users
// ─────────────────────────────────────────────────────────────────────────────

export async function createUser(params: {
    username: string;
    email: string | null;
    passwordHash: string;
    role?: "admin" | "analyst";
}): Promise<User> {
    const { username, email, passwordHash, role = "analyst" } = params;
    const { rows } = await query<pg.QueryResultRow>(
        `INSERT INTO users (username, email, password_hash, role)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [username, email, passwordHash, role],
    );
    return rowToUser(rows[0]);
}

export async function getUserById(id: string): Promise<User | null> {
    const { rows } = await query(`SELECT * FROM users WHERE id = $1`, [id]);
    return rows[0] ? rowToUser(rows[0]) : null;
}

export async function getUserByEmail(email: string): Promise<User | null> {
    const { rows } = await query(`SELECT * FROM users WHERE email = $1`, [email]);
    return rows[0] ? rowToUser(rows[0]) : null;
}

export async function getUserByUsername(username: string): Promise<User | null> {
    const { rows } = await query(`SELECT * FROM users WHERE username = $1`, [username]);
    return rows[0] ? rowToUser(rows[0]) : null;
}

export async function updateUserRole(
    id: string,
    role: "admin" | "analyst",
): Promise<User | null> {
    const { rows } = await query(
        `UPDATE users SET role = $1 WHERE id = $2 RETURNING *`,
        [role, id],
    );
    return rows[0] ? rowToUser(rows[0]) : null;
}

export async function deleteUser(id: string): Promise<boolean> {
    const { rowCount } = await query(`DELETE FROM users WHERE id = $1`, [id]);
    return (rowCount ?? 0) > 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sessions
// ─────────────────────────────────────────────────────────────────────────────

export async function createSession(params: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
}): Promise<Session> {
    const { userId, tokenHash, expiresAt } = params;
    const { rows } = await query(
        `INSERT INTO sessions (user_id, token_hash, expires_at)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [userId, tokenHash, expiresAt],
    );
    return rowToSession(rows[0]);
}

export async function getSessionByTokenHash(tokenHash: string): Promise<Session | null> {
    const { rows } = await query(
        `SELECT * FROM sessions WHERE token_hash = $1`,
        [tokenHash],
    );
    return rows[0] ? rowToSession(rows[0]) : null;
}

export async function getActiveSessionByTokenHash(tokenHash: string): Promise<Session | null> {
    const { rows } = await query(
        `SELECT * FROM sessions
         WHERE token_hash = $1
           AND revoked = FALSE
           AND expires_at > NOW()`,
        [tokenHash],
    );
    return rows[0] ? rowToSession(rows[0]) : null;
}

export async function refreshSession(oldHash: string, newHash: string): Promise<boolean> {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const res = await client.query(
            `SELECT id FROM sessions
             WHERE token_hash = $1
               AND revoked = FALSE
               AND expires_at > NOW()
             FOR UPDATE`,
            [oldHash],
        );
        if (res.rowCount === 0) throw new Error('session not found or expired');

        const sessionId: string = res.rows[0].id;

        await client.query(
            `UPDATE sessions SET token_hash = $1 WHERE id = $2`,
            [newHash, sessionId],
        );

        await client.query('COMMIT');
        return true;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

// Revoke a single session (logout)
export async function revokeSession(id: string): Promise<boolean> {
    const { rowCount } = await query(
        `UPDATE sessions SET revoked = TRUE WHERE id = $1`,
        [id],
    );
    return (rowCount ?? 0) > 0;
}

// Revoke all sessions for a user (e.g. password change, security wipe)
export async function revokeAllUserSessions(userId: string): Promise<number> {
    const { rowCount } = await query(
        `UPDATE sessions SET revoked = TRUE WHERE user_id = $1 AND revoked = FALSE`,
        [userId],
    );
    return rowCount ?? 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Documents
// ─────────────────────────────────────────────────────────────────────────────

export async function createDocument(params: {
    userId: string;
    title: string;
    customer: string;
    issueDate: Date;
    currency?: string;
}): Promise<Document> {
    const { userId, title, customer, issueDate, currency = "ngn" } = params;
    const { rows } = await query(
        `INSERT INTO documents (user_id, title, customer, issue_date, currency)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [userId, title, customer, issueDate, currency],
    );
    return rowToDocument(rows[0]);
}

export async function getDocumentById(id: string): Promise<Document | null> {
    const { rows } = await query(`SELECT * FROM documents WHERE id = $1`, [id]);
    return rows[0] ? rowToDocument(rows[0]) : null;
}

// Only returns documents belonging to the user — never cross-user
export async function listDocumentsByUser(userId: string): Promise<Document[]> {
    const { rows } = await query(
        `SELECT * FROM documents WHERE user_id = $1 ORDER BY created_at DESC`,
        [userId],
    );
    return rows.map(rowToDocument);
}

export async function updateDocumentMeta(
    id: string,
    params: Partial<{ title: string; customer: string; issueDate: Date }>,
): Promise<Document | null> {
    // Only DRAFT documents can have their meta edited — enforce at DB level too
    const { rows } = await query(
        `UPDATE documents
         SET
             title      = COALESCE($1, title),
             customer   = COALESCE($2, customer),
             issue_date = COALESCE($3, issue_date),
             updated_at = NOW()
         WHERE id = $4 AND status = 'DRAFT'
         RETURNING *`,
        [params.title ?? null, params.customer ?? null, params.issueDate ?? null, id],
    );
    return rows[0] ? rowToDocument(rows[0]) : null;
}

// Stamp computed totals and flip status to FINALIZED atomically
export async function finalizeDocument(
    id: string,
    totals: {
        subTotal: bigint;
        totalDiscount: bigint;
        totalTax: bigint;
        grandTotal: bigint;
    },
): Promise<Document | null> {
    const { rows } = await query(
        `UPDATE documents
         SET
             status         = 'FINALIZED',
             subtotal       = $1,
             total_discount = $2,
             total_tax      = $3,
             grand_total    = $4,
             updated_at     = NOW()
         WHERE id = $5 AND status = 'DRAFT'
         RETURNING *`,
        [
            totals.subTotal.toString(),
            totals.totalDiscount.toString(),
            totals.totalTax.toString(),
            totals.grandTotal.toString(),
            id,
        ],
    );
    return rows[0] ? rowToDocument(rows[0]) : null;
}

// Only DRAFT documents can be deleted
export async function deleteDocument(id: string): Promise<boolean> {
    const { rowCount } = await query(
        `DELETE FROM documents WHERE id = $1 AND status = 'DRAFT'`,
        [id],
    );
    return (rowCount ?? 0) > 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Line items
// ─────────────────────────────────────────────────────────────────────────────

type LineItemInput = {
    documentId: string;
    description: string;
    quantity: number;
    unitPrice: number;          // major units (e.g. dollars, naira) — as entered by user
    discountType: DiscountType | null;
    discountValue: number | null; // major units if FIXED, plain percent if PERCENT — as entered
    taxPercent: number | null;   // plain percent (e.g. 7.5) — as entered
    // pre-computed by calculateLine — stored so reports don't need to recalculate
    subtotal: bigint;
    discountAmount: bigint;
    afterDiscount: bigint;
    taxAmount: bigint;
    lineTotal: bigint;
};

export async function createLineItem(input: LineItemInput): Promise<LineItem> {
    const { rows } = await query(
        `INSERT INTO line_items (
            document_id, description, quantity, unit_price,
            discount_type, discount_value, tax_percent,
            subtotal, discount_amount, after_discount, tax_amount, line_total
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        RETURNING *`,
        [
            input.documentId,
            input.description,
            input.quantity,
            input.unitPrice,
            input.discountType,
            input.discountValue ?? null,
            input.taxPercent,
            input.subtotal.toString(),
            input.discountAmount.toString(),
            input.afterDiscount.toString(),
            input.taxAmount.toString(),
            input.lineTotal.toString(),
        ],
    );
    return rowToLineItem(rows[0]);
}

// Insert multiple line items in a single multi-row INSERT — one round trip, atomically
export async function createLineItemsBatch(inputs: LineItemInput[]): Promise<LineItem[]> {
    if (inputs.length === 0) return [];

    const COLS = 12;
    const values: unknown[] = [];
    const placeholders = inputs.map((input, i) => {
        const base = i * COLS;
        values.push(
            input.documentId,
            input.description,
            input.quantity,
            input.unitPrice,
            input.discountType,
            input.discountValue ?? null,
            input.taxPercent,
            input.subtotal.toString(),
            input.discountAmount.toString(),
            input.afterDiscount.toString(),
            input.taxAmount.toString(),
            input.lineTotal.toString(),
        );
        return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6},$${base+7},$${base+8},$${base+9},$${base+10},$${base+11},$${base+12})`;
    });

    const { rows } = await query(
        `INSERT INTO line_items (
            document_id, description, quantity, unit_price,
            discount_type, discount_value, tax_percent,
            subtotal, discount_amount, after_discount, tax_amount, line_total
        ) VALUES ${placeholders.join(",")}
        RETURNING *`,
        values,
    );

    return rows.map(row => rowToLineItem(row));
}

export async function getLineItemsByDocument(documentId: string, currency?: Currency): Promise<LineItem[]> {
    const { rows } = await query(
        `SELECT * FROM line_items WHERE document_id = $1 ORDER BY created_at ASC`,
        [documentId],
    );
    return rows.map(row => rowToLineItem(row, currency));
}

export async function getLineItemById(id: string, currency?: Currency): Promise<LineItem | null> {
    const { rows } = await query(`SELECT * FROM line_items WHERE id = $1`, [id]);
    return rows[0] ? rowToLineItem(rows[0], currency) : null;
}

export async function updateLineItem(
    id: string,
    input: Partial<LineItemInput>,
): Promise<LineItem | null> {
    // Fetch current row, merge, rewrite — keeps the UPDATE simple and safe
    const existing = await getLineItemById(id);
    if (!existing) return null;

    const merged = {
        description:    input.description    ?? existing.description,
        quantity:       input.quantity       ?? existing.quantity,
        unitPrice:      input.unitPrice      ?? existing.unitPrice,
        discountType:   "discountType"  in input ? input.discountType  : (existing.discountType  ?? null),
        discountValue:  "discountValue" in input ? (input.discountValue ?? null) : (existing.discountValue ?? null),
        taxPercent:     "taxPercent"    in input ? input.taxPercent    : (existing.taxPercent ?? null),
        subtotal:       input.subtotal       ?? BigInt(0),
        discountAmount: input.discountAmount ?? BigInt(0),
        afterDiscount:  input.afterDiscount  ?? BigInt(0),
        taxAmount:      input.taxAmount      ?? BigInt(0),
        lineTotal:      input.lineTotal      ?? BigInt(0),
    };

    const { rows } = await query(
        `UPDATE line_items
         SET
             description     = $1,
             quantity        = $2,
             unit_price      = $3,
             discount_type   = $4,
             discount_value  = $5,
             tax_percent     = $6,
             subtotal        = $7,
             discount_amount = $8,
             after_discount  = $9,
             tax_amount      = $10,
             line_total      = $11,
             updated_at      = NOW()
         WHERE id = $12
         RETURNING *`,
        [
            merged.description,
            merged.quantity,
            merged.unitPrice,
            merged.discountType,
            merged.discountValue ?? null,
            merged.taxPercent,
            merged.subtotal.toString(),
            merged.discountAmount.toString(),
            merged.afterDiscount.toString(),
            merged.taxAmount.toString(),
            merged.lineTotal.toString(),
            id,
        ],
    );
    return rows[0] ? rowToLineItem(rows[0]) : null;
}

export async function deleteLineItem(id: string): Promise<boolean> {
    const { rowCount } = await query(`DELETE FROM line_items WHERE id = $1`, [id]);
    return (rowCount ?? 0) > 0;
}

export async function deleteLineItemsByDocument(documentId: string): Promise<number> {
    const { rowCount } = await query(
        `DELETE FROM line_items WHERE document_id = $1`,
        [documentId],
    );
    return rowCount ?? 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reports
// ─────────────────────────────────────────────────────────────────────────────

export type PeriodSummaryRow = {
    currency:      string;
    documentCount: number;
    subTotal:      number;
    totalDiscount: number;
    totalTax:      number;
    grandTotal:    number;
};

export async function getDocumentPeriodSummary(params: {
    userId:   string;
    from:     Date;
    to:       Date;
    status:   "DRAFT" | "FINALIZED";
}): Promise<PeriodSummaryRow[]> {
    const { userId, from, to, status } = params;

    const { rows } = await query<{
        currency:       string;
        document_count: string;
        sub_total:      string;
        total_discount: string;
        total_tax:      string;
        grand_total:    string;
    }>(
        `SELECT
            currency,
            COUNT(*)                          AS document_count,
            COALESCE(SUM(subtotal),       0)  AS sub_total,
            COALESCE(SUM(total_discount), 0)  AS total_discount,
            COALESCE(SUM(total_tax),      0)  AS total_tax,
            COALESCE(SUM(grand_total),    0)  AS grand_total
         FROM documents
         WHERE user_id    = $1
           AND status     = $2
           AND issue_date >= $3
           AND issue_date <= $4
         GROUP BY currency
         ORDER BY currency`,
        [userId, status, from, to],
    );

    return rows.map(row => ({
        currency:      row.currency,
        documentCount: parseInt(row.document_count, 10),
        subTotal:      parseInt(row.sub_total,      10),
        totalDiscount: parseInt(row.total_discount, 10),
        totalTax:      parseInt(row.total_tax,      10),
        grandTotal:    parseInt(row.grand_total,    10),
    }));
}
