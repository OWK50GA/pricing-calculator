import "dotenv/config";

function require(name: string): string {
    const value = process.env[name];
    if (!value) throw new Error(`Missing required environment variable: ${name}`);
    return value;
}

export const config = {
    port:                parseInt(process.env.PORT ?? "3001", 10),
    databaseUrl:         require("DATABASE_URL"),
    jwtSecret:           require("JWT_SECRET"),
    // e.g. "15m", "1h" — passed directly to jsonwebtoken
    jwtAccessExpiry:     process.env.JWT_ACCESS_EXPIRY     ?? "15m",
    // e.g. "7d" — used to compute the hard expires_at stored on the session row
    refreshTokenLifetime: process.env.REFRESH_TOKEN_LIFETIME ?? "7d",
} as const;
