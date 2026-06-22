import type { FastifyInstance } from "fastify";
import type { Db } from "../db";

interface PushFile {
  key: string;
  ciphertext: string;
  nonce: string;
  tag: string;
  updated_at: number;
}

interface PushBody {
  persona_id?: string;
  machine_id?: string;
  files?: PushFile[];
}

interface ExistingRow {
  updated_at: number;
  machine_id: string;
}

interface Conflict {
  key: string;
  remote_updated_at: number;
  remote_machine: string;
}

const pushPlugin = async (
  app: FastifyInstance,
  opts: { db: Db },
): Promise<void> => {
  app.post<{ Body: PushBody }>("/sync/push", async (req, reply) => {
    const userId = req.user!.user_id;
    const personaId = req.body?.persona_id;
    const machineId = req.body?.machine_id;
    const files = req.body?.files;

    if (!personaId || !machineId || !Array.isArray(files)) {
      return reply
        .code(400)
        .send({ error: "persona_id, machine_id, and files[] are required" });
    }

    const selectExisting = opts.db.prepare(
      "SELECT updated_at, machine_id FROM sync_store WHERE user_id = ? AND persona_id = ? AND file_key = ?",
    );
    const upsert = opts.db.prepare(
      `INSERT INTO sync_store (user_id, persona_id, file_key, ciphertext, nonce, tag, machine_id, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, persona_id, file_key) DO UPDATE SET
         ciphertext = excluded.ciphertext,
         nonce      = excluded.nonce,
         tag        = excluded.tag,
         machine_id = excluded.machine_id,
         updated_at = excluded.updated_at`,
    );

    const conflicts: Conflict[] = [];

    for (const f of files) {
      const existing = selectExisting.get(userId, personaId, f.key) as
        | ExistingRow
        | undefined;
      // Conflict: remote is strictly newer than incoming -> keep remote.
      if (existing && existing.updated_at > f.updated_at) {
        conflicts.push({
          key: f.key,
          remote_updated_at: existing.updated_at,
          remote_machine: existing.machine_id,
        });
        continue;
      }
      upsert.run(
        userId,
        personaId,
        f.key,
        f.ciphertext,
        f.nonce,
        f.tag,
        machineId,
        f.updated_at,
      );
    }

    return reply.send({ ok: true, conflicts });
  });
};

export default pushPlugin;
