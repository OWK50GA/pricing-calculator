-- Migration 001: Initial schema
-- Run with: psql $DATABASE_URL -f migrations/001_initial_schema.sql

CREATE TABLE IF NOT EXISTS users (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    password_hash VARCHAR     NOT NULL,
    username     VARCHAR     NOT NULL UNIQUE,
    email        VARCHAR     UNIQUE,
    role         VARCHAR     NOT NULL DEFAULT 'analyst' CHECK (role IN ('admin', 'analyst')),
    created_at   TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  VARCHAR     NOT NULL UNIQUE,
    expires_at  TIMESTAMP   NOT NULL,
    revoked     BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id    ON sessions(user_id);

CREATE TABLE IF NOT EXISTS documents (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID        NOT NULL REFERENCES users(id),
    title          VARCHAR     NOT NULL,
    customer       VARCHAR     NOT NULL,
    issue_date     DATE        NOT NULL,
    status         VARCHAR     NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'FINALIZED')),
    currency       VARCHAR     NOT NULL DEFAULT 'ngn',
    subtotal       BIGINT,
    total_discount BIGINT,
    total_tax      BIGINT,
    grand_total    BIGINT,
    created_at     TIMESTAMP   NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS line_items (
    id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id     UUID    NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    description     VARCHAR NOT NULL,
    quantity        INTEGER NOT NULL CHECK (quantity >= 1),
    unit_price      NUMERIC(15,4) NOT NULL CHECK (unit_price >= 0),  -- major units (e.g. 9.99)
    discount_type   VARCHAR CHECK (discount_type IN ('FIXED', 'PERCENT')),
    discount_value  NUMERIC(15,4),  -- major units if FIXED; plain percent (e.g. 10.5) if PERCENT
    tax_percent     NUMERIC(7,4),   -- plain percent (e.g. 7.5 for 7.5% VAT)
    subtotal        BIGINT  NOT NULL,  -- pre-computed in smallest currency unit
    discount_amount BIGINT  NOT NULL,
    after_discount  BIGINT  NOT NULL,
    tax_amount      BIGINT  NOT NULL,
    line_total      BIGINT  NOT NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
