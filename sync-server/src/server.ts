import Fastify, { type FastifyInstance } from "fastify";
import { openDb, type Db } from "./db";
import { buildAuthHook } from "./auth";
import registerRoute from "./routes/register";
import pushRoute from "./routes/push";
import pullRoute from "./routes/pull";
import statusRoute from "./routes/status";
import deletePersonaRoute from "./routes/deletePersona";

export interface BuildServerOpts {
  /** Directory for the SQLite file. Use ":memory:" for an ephemeral DB. */
  dataDir?: string;
  /** Inject an already-open DB (takes precedence over dataDir). */
  db?: Db;
  /** Enable Fastify request logging. */
  logger?: boolean;
  /** Max request body size in bytes (default 64 MiB). Needed because a large
   *  memories.jsonl registry can exceed Fastify's ~1 MiB default. */
  bodyLimit?: number;
}

export async function buildServer(
  opts: BuildServerOpts = {},
): Promise<FastifyInstance> {
  const openedHere = !opts.db;
  const db = opts.db ?? openDb(opts.dataDir ?? "./data");

  const envLimitMb = Number.parseInt(process.env.AUTOLEARN_SYNC_BODY_LIMIT_MB ?? "", 10);
  const bodyLimit =
    opts.bodyLimit ??
    (Number.isFinite(envLimitMb) && envLimitMb > 0 ? envLimitMb * 1024 * 1024 : 64 * 1024 * 1024);

  const app = Fastify({ logger: opts.logger ?? false, bodyLimit });

  app.addHook("onRequest", buildAuthHook(db));

  app.get("/health", async () => ({ ok: true }));

  await app.register(registerRoute, { db });
  await app.register(pushRoute, { db });
  await app.register(pullRoute, { db });
  await app.register(statusRoute, { db });
  await app.register(deletePersonaRoute, { db });

  app.addHook("onClose", async () => {
    if (openedHere) db.close();
  });

  return app;
}
