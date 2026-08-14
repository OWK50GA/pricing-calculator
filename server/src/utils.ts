export function parseExpiryMs(expiry: string): number {
  const unit = expiry.slice(-1);
  const value = parseInt(expiry.slice(0, -1));

  switch (unit) {
    case "s":
      return value * 1000;
    case "m":
      return value * 60 * 1000;
    case "h":
      return value * 60 * 60 * 1000;
    case "d":
      return value * 24 * 60 * 60 * 1000;
    default:
      throw new Error(`Unknown expiry unit: ${unit}`);
  }
}

import crypto from "crypto";
import jwt from "jsonwebtoken";
import { config } from "./config.js";

export type IssuedTokens = {
    // Send to client as the short-lived Bearer token
    accessToken: string;
    // Send to client for storage; used to rotate the session
    refreshToken: string;
    // Hash of refreshToken — this is what gets stored in the DB
    refreshTokenHash: string;
    // Absolute expiry of the session / refresh token
    refreshTokenExpiresAt: Date;
};

/**
 * Issues a JWT access token and a random-bytes refresh token for a given user.
 *
 * Call this on login and on every successful token refresh.
 * Store `refreshTokenHash` and `refreshTokenExpiresAt` in the sessions table.
 * Send `accessToken` and `refreshToken` to the client.
 *
 * The refresh token's lifetime is fixed at creation and never extended —
 * pass `existingExpiresAt` when rotating so the cap is preserved.
 */
export function issueTokens(
    userId: string,
    role: string,
    existingExpiresAt?: Date,
): IssuedTokens {
    // JWT access token — short-lived, stateless
    const accessToken = jwt.sign(
        { userId, role },
        config.jwtSecret,
        { expiresIn: config.jwtAccessExpiry as jwt.SignOptions["expiresIn"] },
    );

    // Opaque refresh token — 32 random bytes as hex (64 char string)
    const refreshToken = crypto.randomBytes(32).toString("hex");

    // SHA-256 hash of the raw token — only the hash is stored in the DB
    const refreshTokenHash = crypto
        .createHash("sha256")
        .update(refreshToken)
        .digest("hex");

    // On first issuance, set the hard cap from config.
    // On rotation, preserve the original cap — the session lifetime never extends.
    const refreshTokenExpiresAt = existingExpiresAt
        ?? new Date(Date.now() + parseExpiryMs(config.refreshTokenLifetime));

    return {
        accessToken,
        refreshToken,
        refreshTokenHash,
        refreshTokenExpiresAt,
    };
}
