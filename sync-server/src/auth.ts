import crypto from "node:crypto";
import bcrypt from "bcrypt";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Db } from "./db";

const BCRYPT_COST = parseInt(process.env.AUTOLEARN_BCRYPT_COST || "10", 10);

// Per-process cache of successful bcrypt verifications. Keyed by
// `user_id + ":" + sha256(api_key)` so that repeated authenticated requests
// with the same key skip bcrypt's deliberately-slow cost. Only positive
// results are cached; failed verifications always fall through to bcrypt
// so brute-force attempts are never accelerated.
const verifyCache = new Map<string, true>();

declare module "fastify" {
  interface FastifyRequest {
    user?: { user_id: string };
  }
}

export function userIdFromApiKey(apiKey: string): string {
  return crypto.createHash("sha256").update(apiKey).digest("hex");
}

export async function hashApiKey(apiKey: string): Promise<string> {
  return bcrypt.hash(apiKey, BCRYPT_COST);
}

export async function verifyApiKey(
  apiKey: string,
  hash: string,
  userId: string,
): Promise<boolean> {
  const cacheKey = `${userId}:${userIdFromApiKey(apiKey)}`;
  if (verifyCache.has(cacheKey)) return true;
  const ok = await bcrypt.compare(apiKey, hash);
  if (ok) verifyCache.set(cacheKey, true);
  return ok;
}

export function buildAuthHook(db: Db) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    // Skip auth for the registration endpoint (provisions new users) and
    // for the unauthenticated health check. Parse req.url directly so the
    // skip works in onRequest before route resolution populates routerPath.
    const urlPath = (req.url || "").split("?")[0];
    if (urlPath === "/sync/register" || urlPath === "/health") return;

    const header = req.headers.authorization || "";
    if (!header.startsWith("Bearer ")) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const apiKey = header.slice("Bearer ".length);
    const userId = userIdFromApiKey(apiKey);

    const row = db
      .prepare("SELECT api_key_hash FROM users WHERE user_id = ?")
      .get(userId) as { api_key_hash: string } | undefined;
    if (!row) {
      return reply.code(401).send({ error: "unauthorized" });
    }

    const ok = await verifyApiKey(apiKey, row.api_key_hash, userId);
    if (!ok) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    req.user = { user_id: userId };
  };
}
