import type { FastifyReply } from "fastify";

export function sendUnauthorized(reply: FastifyReply): FastifyReply {
  return reply.code(401).send({ error: "unauthorized" });
}
