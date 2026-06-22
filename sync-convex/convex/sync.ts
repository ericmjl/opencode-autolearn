import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

// ===========================================================================
// User registration
// ===========================================================================

export const getUser = internalQuery({
  args: { user_id: v.string() },
  handler: async (ctx, { user_id }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_user_id", (q) => q.eq("user_id", user_id))
      .first();
    return user;
  },
});

export const createUser = internalMutation({
  args: { user_id: v.string(), api_key_hash: v.string() },
  handler: async (ctx, { user_id, api_key_hash }) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_user_id", (q) => q.eq("user_id", user_id))
      .first();
    if (existing) {
      return { created: false };
    }
    await ctx.db.insert("users", {
      user_id,
      api_key_hash,
      created_at: Date.now(),
    });
    return { created: true };
  },
});

// ===========================================================================
// Push
// ===========================================================================

export const pushFiles = internalMutation({
  args: {
    user_id: v.string(),
    persona_id: v.string(),
    machine_id: v.string(),
    files: v.array(
      v.object({
        key: v.string(),
        ciphertext: v.string(),
        nonce: v.string(),
        tag: v.string(),
        updated_at: v.number(),
      }),
    ),
  },
  handler: async (ctx, { user_id, persona_id, machine_id, files }) => {
    const conflicts: Array<{
      key: string;
      remote_updated_at: number;
      remote_machine: string;
    }> = [];

    for (const f of files) {
      const existing = await ctx.db
        .query("sync_store")
        .withIndex("by_user_persona_key", (q) =>
          q
            .eq("user_id", user_id)
            .eq("persona_id", persona_id)
            .eq("file_key", f.key),
        )
        .first();

      // Conflict: remote is strictly newer -> keep remote.
      if (existing && existing.updated_at > f.updated_at) {
        conflicts.push({
          key: f.key,
          remote_updated_at: existing.updated_at,
          remote_machine: existing.machine_id,
        });
        continue;
      }

      if (existing) {
        await ctx.db.patch(existing._id, {
          ciphertext: f.ciphertext,
          nonce: f.nonce,
          tag: f.tag,
          machine_id: machine_id,
          updated_at: f.updated_at,
        });
      } else {
        await ctx.db.insert("sync_store", {
          user_id,
          persona_id,
          file_key: f.key,
          ciphertext: f.ciphertext,
          nonce: f.nonce,
          tag: f.tag,
          machine_id: machine_id,
          updated_at: f.updated_at,
        });
      }
    }

    return { conflicts };
  },
});

// ===========================================================================
// Pull
// ===========================================================================

export const pullFiles = internalQuery({
  args: {
    user_id: v.string(),
    persona_id: v.string(),
    since: v.number(),
  },
  handler: async (ctx, { user_id, persona_id, since }) => {
    const rows = await ctx.db
      .query("sync_store")
      .withIndex("by_user_persona", (q) =>
        q.eq("user_id", user_id).eq("persona_id", persona_id),
      )
      .filter((q) => q.gt(q.field("updated_at"), since))
      .collect();

    return {
      files: rows.map((r) => ({
        key: r.file_key,
        ciphertext: r.ciphertext,
        nonce: r.nonce,
        tag: r.tag,
        machine_id: r.machine_id,
        updated_at: r.updated_at,
      })),
    };
  },
});

// ===========================================================================
// Status
// ===========================================================================

export const getStatus = internalQuery({
  args: { user_id: v.string() },
  handler: async (ctx, { user_id }) => {
    const rows = await ctx.db
      .query("sync_store")
      .withIndex("by_user_persona", (q) => q.eq("user_id", user_id))
      .collect();

    const byPersona = new Map<
      string,
      { files: number; last_sync: number; machines: Set<string> }
    >();

    for (const r of rows) {
      const entry = byPersona.get(r.persona_id) ?? {
        files: 0,
        last_sync: 0,
        machines: new Set<string>(),
      };
      entry.files += 1;
      entry.last_sync = Math.max(entry.last_sync, r.updated_at);
      entry.machines.add(r.machine_id);
      byPersona.set(r.persona_id, entry);
    }

    return {
      personas: Array.from(byPersona.entries()).map(([persona_id, e]) => ({
        persona_id,
        files: e.files,
        last_sync: e.last_sync || null,
        machines: Array.from(e.machines),
      })),
    };
  },
});

// ===========================================================================
// Delete persona
// ===========================================================================

export const deletePersona = internalMutation({
  args: { user_id: v.string(), persona_id: v.string() },
  handler: async (ctx, { user_id, persona_id }) => {
    const rows = await ctx.db
      .query("sync_store")
      .withIndex("by_user_persona", (q) =>
        q.eq("user_id", user_id).eq("persona_id", persona_id),
      )
      .collect();
    for (const r of rows) {
      await ctx.db.delete(r._id);
    }
    return { deleted: rows.length };
  },
});
