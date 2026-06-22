import type { FastifyInstance } from "fastify";
import type { Db } from "../db";

interface DeleteParams {
  persona_id: string;
}

const deletePersonaPlugin = async (
  app: FastifyInstance,
  opts: { db: Db },
): Promise<void> => {
  app.delete<{ Params: DeleteParams }>(
    "/sync/persona/:persona_id",
    async (req, reply) => {
      const userId = req.user!.user_id;
      opts.db
        .prepare(
          "DELETE FROM sync_store WHERE user_id = ? AND persona_id = ?",
        )
        .run(userId, req.params.persona_id);
      return reply.send({ ok: true });
    },
  );
};

export default deletePersonaPlugin;
