import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";

interface AccessTokenPayload {
    userId: string;
    role:   string;
}

/**
 * Verifies the JWT access token in the Authorization header and attaches
 * { userId, role } to req.user.
 *
 * The access token is a short-lived JWT (default 15m).
 * It does NOT hit the database — the signature alone is the proof of identity.
 * Session validity (revocation, expiry) is enforced at the refresh endpoint
 * when the client exchanges a refresh token for a new access token.
 */
export function authenticate(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ status: "error", message: "Missing or malformed Authorization header" });
    }

    const token = authHeader.slice(7); // strip "Bearer "

    try {
        const payload = jwt.verify(token, config.jwtSecret) as AccessTokenPayload;

        if (typeof payload.userId !== "string" || typeof payload.role !== "string") {
            return res.status(401).json({ status: "error", message: "Invalid token payload" });
        }

        req.user = { userId: payload.userId, role: payload.role };
        return next();
    } catch (err) {
        if (err instanceof jwt.TokenExpiredError) {
            return res.status(401).json({ status: "error", message: "Access token expired" });
        }
        return res.status(401).json({ status: "error", message: "Invalid access token" });
    }
}
