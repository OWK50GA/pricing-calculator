import { Request, Response } from "express";
import * as bcrypt from "bcrypt";
import { createHash } from "crypto";
import {
    createSession,
    createUser,
    getSessionByTokenHash,
    getUserByEmail,
    getUserById,
    refreshSession,
} from "../db/db.js";
import { issueTokens, parseExpiryMs } from "../utils.js";
import { config } from "../config.js";

// Shape of the token response — consistent across register, login, refresh
function tokenResponse(tokens: ReturnType<typeof issueTokens>) {
    return {
        status:        "success",
        access_token:  tokens.accessToken,
        refresh_token: tokens.refreshToken,
        token_type:    "Bearer",
        expires_in:    parseExpiryMs(config.jwtAccessExpiry),
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /auth/register
// ─────────────────────────────────────────────────────────────────────────────

export async function emailSignUp(req: Request, res: Response) {
    const { email, password, username } = req.body;

    if (!email || !password || !username) {
        return res.status(400).json({ status: "error", message: "Missing fields in request body" });
    }
    if (typeof email !== "string" || typeof password !== "string" || typeof username !== "string") {
        return res.status(422).json({ status: "error", message: "Unprocessable entity" });
    }
    if (email.length < 5 || username.length < 3 || password.length < 8) {
        return res.status(400).json({ status: "error", message: "Invalid lengths" });
    }

    try {
        const passwordHash = await bcrypt.hash(password, 10);
        const user = await createUser({ username, email, passwordHash });

        const tokens = issueTokens(user.id, user.role);
        await createSession({
            userId:    user.id,
            tokenHash: tokens.refreshTokenHash,
            expiresAt: tokens.refreshTokenExpiresAt,
        });

        return res.status(201).json(tokenResponse(tokens));
    } catch (err) {
        console.error(err);
        return res.status(500).json({ status: "error", message: "Internal server error" });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /auth/login
// ─────────────────────────────────────────────────────────────────────────────

export async function emailLogin(req: Request, res: Response) {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ status: "error", message: "Email or password missing" });
    }
    if (typeof email !== "string" || typeof password !== "string") {
        return res.status(422).json({ status: "error", message: "Unprocessable entity" });
    }

    try {
        const user = await getUserByEmail(email);
        if (!user) {
            return res.status(401).json({ status: "error", message: "Incorrect email or password" });
        }

        const isValid = await bcrypt.compare(password, user.passwordHash);
        if (!isValid) {
            return res.status(401).json({ status: "error", message: "Incorrect email or password" });
        }

        const tokens = issueTokens(user.id, user.role);
        await createSession({
            userId:    user.id,
            tokenHash: tokens.refreshTokenHash,
            expiresAt: tokens.refreshTokenExpiresAt,
        });

        return res.status(200).json(tokenResponse(tokens));
    } catch (err) {
        console.error(err);
        return res.status(500).json({ status: "error", message: "Internal server error" });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /auth/refresh
// Rotates the refresh token. The session lifetime cap (expires_at) is preserved —
// it is passed into issueTokens so the new token inherits the original expiry.
// ─────────────────────────────────────────────────────────────────────────────

export async function refreshToken(req: Request, res: Response) {
    const { refresh_token } = req.body;

    if (!refresh_token) {
        return res.status(400).json({ status: "error", message: "Missing refresh token" });
    }
    if (typeof refresh_token !== "string") {
        return res.status(422).json({ status: "error", message: "Unprocessable entity" });
    }

    try {
        const tokenHash = createHash("sha256").update(refresh_token).digest("hex");
        const session = await getSessionByTokenHash(tokenHash);

        if (!session) {
            return res.status(401).json({ status: "error", message: "Invalid refresh token" });
        }
        if (session.revoked) {
            return res.status(401).json({ status: "error", message: "Refresh token has been revoked" });
        }
        if (new Date() > new Date(session.expiresAt)) {
            return res.status(401).json({ status: "error", message: "Refresh token expired" });
        }

        const user = await getUserById(session.userId);
        if (!user) {
            return res.status(401).json({ status: "error", message: "User not found" });
        }

        // Pass the original expiresAt so the lifetime cap is never extended
        const tokens = issueTokens(user.id, user.role, session.expiresAt);
        await refreshSession(tokenHash, tokens.refreshTokenHash);

        return res.status(200).json(tokenResponse(tokens));
    } catch (err) {
        console.error(err);
        return res.status(500).json({ status: "error", message: "Internal server error" });
    }
}

/**
 * Undocumented:
 * - No email verification — not in scope for this project
 * - Previous access tokens remain valid until they expire naturally (max jwtAccessExpiry).
 *   A revocation store (e.g. Redis with jti blocklist) would be needed to invalidate them
 *   immediately, but is unnecessary at this scale.
 */
