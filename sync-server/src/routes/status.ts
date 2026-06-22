import type { FastifyInstance } from "fastify";
import type { Db } from "../db";

interface StatusRow {
  persona_id: string;
  files: number;
  last_sync: number | null;
  machines_csv: string | null;
}

interface Persona {
  persona_id: string;
  files: number;
  last_sync: number | null;
  machines: string[];
}

const statusPlugin = async (
  app: FastifyInstance,
  opts: { db: Db },
): Promise<void> => {
  app.get("/sync/status", async (req, reply) => {
    const userId = req.user!.user_id;

    const rows = opts.db
      .prepare(
        `SELECT persona_id,
                COUNT(*)              AS files,
                MAX(updated_at)       AS last_sync,
                GROUP_CONCAT(DISTINCT machine_id) AS machines_csv
         FROM sync_store
         WHERE user_id = ?
         GROUP BY persona_id`,
      )
      .all(userId) as StatusRow[];

    const personas: Persona[] = rows.map((r) => ({
      persona_id: r.persona_id,
      files: r.files,
      last_sync: r.last_sync,
      machines: r.machines_csv ? r.machines_csv.split(",") : [],
    }));

    return reply.send({ personas });
  });
};

export default statusPlugin;
