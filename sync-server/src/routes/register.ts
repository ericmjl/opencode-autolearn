import type { FastifyInstance } from "fastify";
import type { Db } from "../db";
import { hashApiKey, userIdFromApiKey } from "../auth";

interface RegisterBody {
  api_key?: string;
}

const registerPlugin = async (
  app: FastifyInstance,
  opts: { db: Db },
): Promise<void> => {
  app.post<{ Body: RegisterBody }>(
    "/sync/register",
    async (req, reply) => {
      const apiKey = req.body?.api_key;
      if (typeof apiKey !== "string" || apiKey.length < 16) {
        return reply
          .code(400)
          .send({ error: "api_key must be at least 16 characters" });
      }

      const userId = userIdFromApiKey(apiKey);
      const existing = opts.db
        .prepare("SELECT 1 FROM users WHERE user_id = ?")
        .get(userId);
      if (existing) {
        return reply.code(409).send({ error: "user already exists" });
      }

      const hash = await hashApiKey(apiKey);
      opts.db
        .prepare(
          "INSERT INTO users (user_id, api_key_hash, created_at) VALUES (?, ?, ?)",
        )
        .run(userId, hash, Math.floor(Date.now() / 1000));

      return reply.code(201).send({ ok: true, user_id: userId });
    },
  );
};

export default registerPlugin;
