import { defineSchema, defineTable } from "convex/schema";
import { v } from "convex/values";

// Field names use snake_case to match the wire format (protocol-LLD.md)
// and the Fastify server's SQLite columns. This avoids a translation layer.
export default defineSchema({
  users: defineTable({
    user_id: v.string(),
    api_key_hash: v.string(),
    created_at: v.number(),
  }).index("by_user_id", ["user_id"]),

  sync_store: defineTable({
    user_id: v.string(),
    persona_id: v.string(),
    file_key: v.string(),
    ciphertext: v.string(),
    nonce: v.string(),
    tag: v.string(),
    machine_id: v.string(),
    updated_at: v.number(),
  })
    .index("by_user_persona", ["user_id", "persona_id"])
    .index("by_user_persona_key", ["user_id", "persona_id", "file_key"]),
});
