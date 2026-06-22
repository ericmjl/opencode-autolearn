import type { FastifyInstance } from "fastify";
import type { Db } from "../db";

interface PullBody {
  persona_id?: string;
  since?: number;
}

interface PullFile {
  key: string;
  ciphertext: string;
  nonce: string;
  tag: string;
  machine_id: string;
  updated_at: number;
}

const pullPlugin = async (
  app: FastifyInstance,
  opts: { db: Db },
): Promise<void> => {
  app.post<{ Body: PullBody }>("/sync/pull", async (req, reply) => {
    const userId = req.user!.user_id;
    const personaId = req.body?.persona_id;
    if (!personaId) {
      return reply.code(400).send({ error: "persona_id is required" });
    }
    const since =
      typeof req.body?.since === "number" ? req.body.since : 0;

    // The PRIMARY KEY (user_id, persona_id, file_key) already guarantees one
    // row per file_key, so a plain SELECT returns the last-write-wins row.
    const rows = opts.db
      .prepare(
        `SELECT file_key AS key, ciphertext, nonce, tag, machine_id, updated_at
         FROM sync_store
         WHERE user_id = ? AND persona_id = ? AND updated_at > ?
         ORDER BY updated_at ASC`,
      )
      .all(userId, personaId, since) as PullFile[];

    return reply.send({ files: rows });
  });
};

export default pullPlugin;
