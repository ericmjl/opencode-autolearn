import { test, expect, beforeAll, afterAll, describe } from "bun:test";
import type { FastifyInstance } from "fastify";
import crypto from "node:crypto";
import { buildServer } from "../src/server";

// >= 16 chars; chosen to comfortably exceed the minimum.
const API_KEY = "test-api-key-0123456789-abcdef";
const WRONG_KEY = "wrong-api-key-0123456789-xyz";

interface Conflict {
  key: string;
  remote_updated_at: number;
  remote_machine: string;
}
interface SyncFile {
  key: string;
  ciphertext: string;
  nonce: string;
  tag: string;
  machine_id: string;
  updated_at: number;
}
interface PersonaStatus {
  persona_id: string;
  files: number;
  last_sync: number | null;
  machines: string[];
}
interface Resp {
  error?: string;
  ok?: boolean;
  user_id?: string;
  conflicts?: Conflict[];
  files?: SyncFile[];
  personas?: PersonaStatus[];
}

// Route the inject response's .json() (typed `any` by light-my-request) through
// a concrete return type so bun-types' expect() infers a real T instead of
// collapsing to its `(actual?: never): Matchers<undefined>` overload.
function resp(r: { json: () => unknown }): Resp {
  return r.json() as Resp;
}

let app: FastifyInstance;
const auth = (key: string = API_KEY): { Authorization: string } => ({
  Authorization: `Bearer ${key}`,
});

beforeAll(async () => {
  app = await buildServer({ dataDir: ":memory:" });
  await app.ready();
  const r = await app.inject({
    method: "POST",
    url: "/sync/register",
    payload: { api_key: API_KEY },
  });
  expect(r.statusCode).toBe(201);
  const body = resp(r);
  expect(body.ok).toBe(true);
  expect(body.user_id).toMatch(/^[0-9a-f]{64}$/);
});

afterAll(async () => {
  await app.close();
});

describe("auth", () => {
  test("request without Bearer token returns 401", async () => {
    const r = await app.inject({ method: "GET", url: "/sync/status" });
    expect(r.statusCode).toBe(401);
    expect(resp(r)).toEqual({ error: "unauthorized" });
  });

  test("request with wrong api key returns 401", async () => {
    const r = await app.inject({
      method: "GET",
      url: "/sync/status",
      headers: auth(WRONG_KEY),
    });
    expect(r.statusCode).toBe(401);
    expect(resp(r)).toEqual({ error: "unauthorized" });
  });

  test("malformed Authorization header returns 401", async () => {
    const r = await app.inject({
      method: "GET",
      url: "/sync/status",
      headers: { Authorization: "Basic abc" },
    });
    expect(r.statusCode).toBe(401);
  });

  test("authenticated status returns 200 with empty personas", async () => {
    const r = await app.inject({
      method: "GET",
      url: "/sync/status",
      headers: auth(),
    });
    expect(r.statusCode).toBe(200);
    expect(resp(r)).toEqual({ personas: [] });
  });
});

describe("registration", () => {
  test("duplicate register with same api_key returns 409", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/sync/register",
      payload: { api_key: API_KEY },
    });
    expect(r.statusCode).toBe(409);
    expect(resp(r)).toEqual({ error: "user already exists" });
  });

  test("register with short api_key returns 400", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/sync/register",
      payload: { api_key: "short" },
    });
    expect(r.statusCode).toBe(400);
    expect(resp(r)).toEqual({
      error: "api_key must be at least 16 characters",
    });
  });
});

describe("push / pull lifecycle", () => {
  test("push two files then pull returns both", async () => {
    const persona = crypto.randomUUID();
    const push = await app.inject({
      method: "POST",
      url: "/sync/push",
      headers: auth(),
      payload: {
        persona_id: persona,
        machine_id: "laptop-1",
        files: [
          { key: "memory.md", ciphertext: "c1", nonce: "n1", tag: "", updated_at: 1000 },
          { key: "state.json", ciphertext: "c2", nonce: "n2", tag: "", updated_at: 1001 },
        ],
      },
    });
    expect(push.statusCode).toBe(200);
    expect(resp(push)).toEqual({ ok: true, conflicts: [] });

    const pull = await app.inject({
      method: "POST",
      url: "/sync/pull",
      headers: auth(),
      payload: { persona_id: persona },
    });
    expect(pull.statusCode).toBe(200);
    const pulled = resp(pull);
    expect(pulled.files).toHaveLength(2);
    expect(pulled.files!.map((f) => f.key).sort()).toEqual([
      "memory.md",
      "state.json",
    ]);
  });

  test("pushing an older updated_at reports a conflict and keeps remote", async () => {
    const persona = crypto.randomUUID();

    const first = await app.inject({
      method: "POST",
      url: "/sync/push",
      headers: auth(),
      payload: {
        persona_id: persona,
        machine_id: "desktop-7",
        files: [
          { key: "memory.md", ciphertext: "newer", nonce: "n", tag: "", updated_at: 2000 },
        ],
      },
    });
    expect(resp(first).conflicts).toEqual([]);

    const older = await app.inject({
      method: "POST",
      url: "/sync/push",
      headers: auth(),
      payload: {
        persona_id: persona,
        machine_id: "laptop-1",
        files: [
          { key: "memory.md", ciphertext: "older", nonce: "n", tag: "", updated_at: 1500 },
        ],
      },
    });
    expect(older.statusCode).toBe(200);
    const body = resp(older);
    expect(body.ok).toBe(true);
    expect(body.conflicts).toEqual([
      { key: "memory.md", remote_updated_at: 2000, remote_machine: "desktop-7" },
    ]);

    const pull = await app.inject({
      method: "POST",
      url: "/sync/pull",
      headers: auth(),
      payload: { persona_id: persona },
    });
    const files = resp(pull).files!;
    expect(files).toHaveLength(1);
    expect(files[0].updated_at).toBe(2000);
    expect(files[0].ciphertext).toBe("newer");
    expect(files[0].machine_id).toBe("desktop-7");
  });

  test("pull with since filter returns only newer files", async () => {
    const persona = crypto.randomUUID();
    await app.inject({
      method: "POST",
      url: "/sync/push",
      headers: auth(),
      payload: {
        persona_id: persona,
        machine_id: "laptop-1",
        files: [
          { key: "a.md", ciphertext: "a", nonce: "n", tag: "", updated_at: 1000 },
          { key: "b.md", ciphertext: "b", nonce: "n", tag: "", updated_at: 2000 },
          { key: "c.md", ciphertext: "c", nonce: "n", tag: "", updated_at: 3000 },
        ],
      },
    });

    const pull = await app.inject({
      method: "POST",
      url: "/sync/pull",
      headers: auth(),
      payload: { persona_id: persona, since: 1500 },
    });
    const keys = resp(pull).files!.map((f) => f.key).sort();
    expect(keys).toEqual(["b.md", "c.md"]);
  });
});

describe("status", () => {
  test("status aggregates per persona across machines", async () => {
    const personaA = crypto.randomUUID();
    const personaB = crypto.randomUUID();

    await app.inject({
      method: "POST",
      url: "/sync/push",
      headers: auth(),
      payload: {
        persona_id: personaA,
        machine_id: "laptop-1",
        files: [
          { key: "a1.md", ciphertext: "x", nonce: "n", tag: "", updated_at: 1000 },
          { key: "a2.md", ciphertext: "x", nonce: "n", tag: "", updated_at: 2000 },
        ],
      },
    });
    await app.inject({
      method: "POST",
      url: "/sync/push",
      headers: auth(),
      payload: {
        persona_id: personaA,
        machine_id: "desktop-7",
        files: [
          { key: "a3.md", ciphertext: "x", nonce: "n", tag: "", updated_at: 3000 },
        ],
      },
    });
    await app.inject({
      method: "POST",
      url: "/sync/push",
      headers: auth(),
      payload: {
        persona_id: personaB,
        machine_id: "phone-9",
        files: [
          { key: "b1.md", ciphertext: "x", nonce: "n", tag: "", updated_at: 4000 },
        ],
      },
    });

    const r = await app.inject({
      method: "GET",
      url: "/sync/status",
      headers: auth(),
    });
    expect(r.statusCode).toBe(200);
    const personas = resp(r).personas!;
    const a = personas.find((p) => p.persona_id === personaA);
    const b = personas.find((p) => p.persona_id === personaB);

    expect(a).toBeDefined();
    expect(a!.files).toBe(3);
    expect(a!.last_sync).toBe(3000);
    expect([...a!.machines].sort()).toEqual(["desktop-7", "laptop-1"]);

    expect(b).toBeDefined();
    expect(b!.files).toBe(1);
    expect(b!.last_sync).toBe(4000);
    expect(b!.machines).toEqual(["phone-9"]);
  });
});

describe("delete persona", () => {
  test("delete removes all blobs for that persona only", async () => {
    const persona = crypto.randomUUID();
    const other = crypto.randomUUID();

    await app.inject({
      method: "POST",
      url: "/sync/push",
      headers: auth(),
      payload: {
        persona_id: persona,
        machine_id: "laptop-1",
        files: [
          { key: "a.md", ciphertext: "x", nonce: "n", tag: "", updated_at: 1000 },
        ],
      },
    });
    await app.inject({
      method: "POST",
      url: "/sync/push",
      headers: auth(),
      payload: {
        persona_id: other,
        machine_id: "laptop-1",
        files: [
          { key: "b.md", ciphertext: "x", nonce: "n", tag: "", updated_at: 1000 },
        ],
      },
    });

    const del = await app.inject({
      method: "DELETE",
      url: `/sync/persona/${persona}`,
      headers: auth(),
    });
    expect(del.statusCode).toBe(200);
    expect(resp(del)).toEqual({ ok: true });

    const pull = await app.inject({
      method: "POST",
      url: "/sync/pull",
      headers: auth(),
      payload: { persona_id: persona },
    });
    expect(resp(pull).files).toEqual([]);

    const otherPull = await app.inject({
      method: "POST",
      url: "/sync/pull",
      headers: auth(),
      payload: { persona_id: other },
    });
    expect(resp(otherPull).files).toHaveLength(1);
  });
});
