import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { hashApiKey, userIdFromApiKey, verifyApiKey } from "./auth";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const MIN_API_KEY_LENGTH = 16;

/**
 * Extract and verify the Bearer token. Returns the authenticated user_id,
 * or null if the request is unauthorized.
 *
 * Calls two internal queries (getUser) and does bcrypt verification.
 * Bcrypt cost 10 is ~100ms — acceptable for personal sync.
 */
async function authenticate(
  ctx: any,
  request: Request,
): Promise<string | null> {
  const header = request.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ")) return null;
  const apiKey = header.slice("Bearer ".length);
  const userId = await userIdFromApiKey(apiKey);

  const user = await ctx.runQuery(internal.sync.getUser, { user_id: userId });
  if (!user) return null;

  const valid = await verifyApiKey(apiKey, user.api_key_hash);
  if (!valid) return null;

  return userId;
}

const unauthorized = () => json(401, { error: "unauthorized" });

// ---------------------------------------------------------------------------
// POST /sync/register
// ---------------------------------------------------------------------------
const register = httpAction(async (ctx, request) => {
  let body: { api_key?: string };
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "invalid JSON body" });
  }

  const apiKey = body.api_key;
  if (typeof apiKey !== "string" || apiKey.length < MIN_API_KEY_LENGTH) {
    return json(400, {
      error: `api_key must be at least ${MIN_API_KEY_LENGTH} characters`,
    });
  }

  const userId = await userIdFromApiKey(apiKey);
  const existing = await ctx.runQuery(internal.sync.getUser, {
    user_id: userId,
  });
  if (existing) {
    return json(409, { error: "user already exists" });
  }

  const hash = await hashApiKey(apiKey);
  const result = await ctx.runMutation(internal.sync.createUser, {
    user_id: userId,
    api_key_hash: hash,
  });
  if (!result.created) {
    return json(409, { error: "user already exists" });
  }
  return json(201, { ok: true, user_id: userId });
});

// ---------------------------------------------------------------------------
// POST /sync/push
// ---------------------------------------------------------------------------
const push = httpAction(async (ctx, request) => {
  const userId = await authenticate(ctx, request);
  if (!userId) return unauthorized();

  let body: {
    persona_id?: string;
    machine_id?: string;
    files?: Array<{
      key: string;
      ciphertext: string;
      nonce: string;
      tag: string;
      updated_at: number;
    }>;
  };
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "invalid JSON body" });
  }

  if (!body.persona_id || !body.machine_id || !Array.isArray(body.files)) {
    return json(400, {
      error: "persona_id, machine_id, and files[] are required",
    });
  }

  const result = await ctx.runMutation(internal.sync.pushFiles, {
    user_id: userId,
    persona_id: body.persona_id,
    machine_id: body.machine_id,
    files: body.files,
  });

  return json(200, { ok: true, conflicts: result.conflicts });
});

// ---------------------------------------------------------------------------
// POST /sync/pull
// ---------------------------------------------------------------------------
const pull = httpAction(async (ctx, request) => {
  const userId = await authenticate(ctx, request);
  if (!userId) return unauthorized();

  let body: { persona_id?: string; since?: number };
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "invalid JSON body" });
  }
  if (!body.persona_id) {
    return json(400, { error: "persona_id is required" });
  }
  const since = typeof body.since === "number" ? body.since : 0;

  const result = await ctx.runQuery(internal.sync.pullFiles, {
    user_id: userId,
    persona_id: body.persona_id,
    since,
  });

  return json(200, { files: result.files });
});

// ---------------------------------------------------------------------------
// GET /sync/status
// ---------------------------------------------------------------------------
const status = httpAction(async (ctx, request) => {
  const userId = await authenticate(ctx, request);
  if (!userId) return unauthorized();

  const result = await ctx.runQuery(internal.sync.getStatus, {
    user_id: userId,
  });
  return json(200, { personas: result.personas });
});

// ---------------------------------------------------------------------------
// DELETE /sync/persona/:persona_id
// ---------------------------------------------------------------------------
const deletePersona = httpAction(async (ctx, request) => {
  const userId = await authenticate(ctx, request);
  if (!userId) return unauthorized();

  const url = new URL(request.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  // Expected path: /sync/persona/<persona_id>
  const personaId = pathParts[pathParts.length - 1];
  if (!personaId || personaId === "persona") {
    return json(400, { error: "persona_id is required in the path" });
  }

  await ctx.runMutation(internal.sync.deletePersona, {
    user_id: userId,
    persona_id: personaId,
  });

  return json(200, { ok: true });
});

// ---------------------------------------------------------------------------
// GET /health (unauthenticated, for Docker health checks and CLI probing)
// ---------------------------------------------------------------------------
const health = httpAction(async () => {
  return json(200, { ok: true });
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
const router = httpRouter();
router.httpRoute("POST", "/sync/register", register);
router.httpRoute("POST", "/sync/push", push);
router.httpRoute("POST", "/sync/pull", pull);
router.httpRoute("GET", "/sync/status", status);
router.httpRoute("DELETE", "/sync/persona", deletePersona);
// Convex HTTP Actions don't support path params in the route pattern, so
// DELETE /sync/persona/:id is handled by parsing the URL in the handler.
router.httpRoute("GET", "/health", health);

export default router;
