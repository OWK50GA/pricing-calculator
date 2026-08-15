# Multi-Rate Pricing Calculator

A full-stack web application for creating documents with line items, applying per-line discounts and tax rules, computing totals correctly, and viewing a summary report for a date range.

---

## Deployed URLs
- [Backend](https://pricing-calculator-bn05.onrender.com)
- [Frontend](https://pricing-calculator-client.vercel.app)

## Prerequisites

- Node.js 20+
- pnpm 11+
- PostgreSQL 14+ (with `gen_random_uuid()` available — built in from Postgres 13)

---

## Setup

**1. Clone and install**

```bash
git clone https://github.com/OWK50GA/pricing-calculator
cd pricing-calculator
pnpm install
```

**2. Configure the server**

```bash
cp server/.env.example server/.env
```

Edit `server/.env`:

```
DATABASE_URL=postgres://user:password@localhost:5432/pricing_calculator
PORT=3001
JWT_SECRET=<a long random string>
JWT_ACCESS_EXPIRY=15m
REFRESH_TOKEN_LIFETIME=7d
CLIENT_URL=http://localhost:5173
```

**3. Run the database migration**

```bash
psql $DATABASE_URL -f server/migrations/001_initial_schema.sql
```

**4. Start the server**

```bash
pnpm dev         # from the project root
```

**5. Start the client**

```bash
pnpm client:dev  # from the project root
```

The client runs on `http://localhost:5173` and proxies `/api` to the server on port 3001.

---

## Running tests

```bash
pnpm test           # single run
pnpm test:watch     # watch mode
pnpm test:coverage  # with coverage report
```

All scripts must be run from the **project root**, not from inside `server/` or `client/`. This is because the repo is a pnpm workspace and `@pricing-calc/calculator` (the shared package) is resolved at the root level.

---

## API overview

All endpoints (except `/auth/*`) require a `Bearer` access token in the `Authorization` header.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/register` | Create account, returns tokens |
| POST | `/auth/login` | Sign in, returns tokens |
| POST | `/auth/refresh` | Rotate refresh token, returns new tokens |
| GET | `/documents` | List the authenticated user's documents |
| POST | `/documents` | Create a new draft document |
| GET | `/documents/:id` | Get a document with its line items |
| PATCH | `/documents/:id` | Update draft metadata (title, customer, date) |
| DELETE | `/documents/:id` | Delete a draft document |
| POST | `/documents/:id/finalize` | Lock a draft and stamp computed totals |
| POST | `/documents/:id/line-items` | Add a line item to a draft |
| POST | `/documents/:id/line-items/batch` | Add multiple line items in one request |
| PATCH | `/documents/:id/line-items/:lineId` | Edit a line item on a draft |
| DELETE | `/documents/:id/line-items/:lineId` | Remove a line item from a draft |
| GET | `/reports/summary?from=&to=&status=` | Aggregated totals for a date range |

---

## Calculation and rounding policy

### Per-line calculation

All monetary arithmetic is performed using **BigInt integer arithmetic in the smallest currency unit** (kobo for NGN, cents for USD, etc.). This eliminates floating-point drift entirely — no rounding library is needed.

The sequence per line item is:

```
1. subtotal       = quantity × unitPrice
2. discountAmount = subtotal × discountPercent/100   (PERCENT)
                  = fixedDiscountAmount              (FIXED)
3. afterDiscount  = subtotal − discountAmount
4. taxAmount      = afterDiscount × taxPercent/100
5. lineTotal      = afterDiscount + taxAmount
```

Discount is applied **before** tax. Tax is computed on the discounted amount, never the original subtotal.

### Rounding policy

BigInt integer division **truncates** (floors). This is the rounding policy, applied consistently at every multiplication/division step. There is no per-line rounding to 2 decimal places — intermediate results stay exact in integer arithmetic throughout. The final display conversion back to major units (`÷ 100` for NGN) may produce decimal values, which are displayed as-is.

### Worked example (from the assignment spec)

| Line | Qty | Unit price | Discount | Tax | Subtotal | Discount amt | After disc | Tax amt | Line total |
|------|-----|------------|----------|-----|----------|--------------|------------|---------|------------|
| Widget A | 2 | 100.00 | 10% | 5% | 200.00 | 20.00 | 180.00 | 9.00 | 189.00 |
| Widget B | 1 | 50.00 | — | 5% | 50.00 | 0.00 | 50.00 | 2.50 | 52.50 |
| Service fee | 1 | 200.00 | $20 fixed | — | 200.00 | 20.00 | 180.00 | 0.00 | 180.00 |

**Document totals:**

| Field | Amount | How derived |
|-------|--------|-------------|
| Subtotal | 450.00 | 200 + 50 + 200 |
| Total discount | 40.00 | 20 + 0 + 20 |
| Total tax | 11.50 | 9.00 + 2.50 + 0 |
| Grand total | 421.50 | 189.00 + 52.50 + 180.00 |

These match the spec exactly. The implementation uses integer kobo arithmetic internally — e.g. Widget A's 5% tax: `(18000 kobo × 500 bps) / 10000 = 900 kobo = ₦9.00`.

### Basis points

Tax and percent discounts are converted to basis points (bps) before multiplication to avoid floating-point issues:

```
7.5%  = 750 bps
5%    = 500 bps
0.01% = 1 bp
```

`applyBps(amount, bps) = (amount × bps) / 10_000`

### Shared calculator module

The calculator logic lives in `packages/calculator` — a pure TypeScript module with no Node or browser dependencies. Both the server and the client import from it. This ensures:

- The live client-side preview while editing a draft uses **identical math** to the server
- There is no duplicated calculation logic anywhere in the codebase
- The server is always the **source of truth** — all stored totals are computed server-side on every write

---

## Document lifecycle

| Status | Behaviour |
|--------|-----------|
| `DRAFT` | Fully editable. Line items can be added, edited, or removed. Metadata (title, customer, date) can be updated. |
| `FINALIZED` | Read-only. No edits to lines, amounts, or metadata are accepted. The API returns a `409` for any mutation attempt. |

Finalization:
- Requires at least one line item (empty documents cannot be finalized)
- The server fetches all line items, recomputes all totals from scratch using the shared calculator, and writes them atomically alongside the status change in a single `UPDATE`
- The client's live preview is for UX only — the server never trusts client-submitted totals

Only `DRAFT` documents can be deleted.

---

## Authentication

The app uses a two-token session scheme:

- **Access token** — short-lived JWT (default 15 minutes). Verified by the auth middleware on every protected request. No database lookup required.
- **Refresh token** — long-lived opaque random bytes (32 bytes, hex-encoded). Stored as a SHA-256 hash in the `sessions` table. Used to rotate the session and issue a new access token.

**Token rotation:** Refreshing issues a new access token and a new refresh token, replacing the old hash in the session row. The session's `expires_at` (the hard lifetime cap) is **never extended** — it is set once at login and preserved through all rotations. If `expires_at` has passed, the session is dead and the user must log in again.

**Token storage:** Tokens are stored in `localStorage`. This is a deliberate simplification for this assignment — the security model is not the evaluation focus. In production, the refresh token would be stored in an `httpOnly` cookie and the access token held in memory only, eliminating XSS exposure of long-lived credentials.

---

## Assumptions and tradeoffs

**Single currency per document.** Each document is issued in one currency, set at creation and locked thereafter. Line items inherit the document's currency. This matches real-world quoting behaviour and avoids the complexity of cross-currency line items.

**Fixed discount clamping.** The spec says to "reject or clamp" when a fixed discount exceeds the line subtotal — document your choice. This implementation **rejects** with a `422` error that includes the maximum allowed discount amount. Silent clamping can mask data entry errors.

**Orders editable after creation.** Draft documents are fully editable until finalized. There is no lock on first line item addition — the only immutability gate is finalization.

**No document-level discounts or taxes.** These exist only at the line item level, which is what the spec requires. Document-level promotions would be a future extension.

**Batch line item insert.** The batch endpoint uses a single multi-row `INSERT ... VALUES (...),(...),...` rather than a loop inside a transaction. This is one round trip to the database, atomically — a single statement is always atomic in Postgres without an explicit transaction.

**Concurrency on finalization.** The `UPDATE documents SET status = 'FINALIZED' WHERE id = $1 AND status = 'DRAFT'` is atomic in Postgres. If two requests try to finalize the same document simultaneously, only one succeeds — the other gets no rows back and receives a `409`. This is the standard optimistic locking pattern without needing `SELECT FOR UPDATE`.

---

## What I would improve before production

- **Token storage** — move refresh token to `httpOnly` cookie, access token to memory only. Add a short-lived token blacklist (Redis) to support immediate logout.
- **Validation library** — replace manual field-by-field validation in controllers with Zod schemas. The dependency is already installed.
- **Migration runner** — add a lightweight migration runner (e.g. `node-pg-migrate`) so schema changes are versioned and applied automatically on deploy rather than run manually with psql.
- **Rate limiting** — add rate limiting to auth endpoints to prevent brute-force attacks.
- **Pagination** — the document list endpoint returns all documents for the user. This needs cursor-based pagination at scale.
- **Email verification** — currently skipped as out of scope. New accounts are immediately active.
- **Audit trail** — for financial documents, append-only audit events (who finalized, when, from what IP) would be valuable before production use.
- **PDF export** — the finalized document view is a natural candidate for a print/PDF endpoint.
