/**
 * Autolearn Plugin — shared core for OpenCode v1 and v2 (beta).
 *
 * All version-independent logic lives here: store management, config,
 * redaction, instruction injection, memory composition, sync, the review
 * wrapper script, review formatting, and detached subprocess spawning.
 *
 * Consumers:
 *   plugin/autolearn.js     — OpenCode v1 shell (function default export)
 *   plugin/autolearn-v2.js  — OpenCode v2 shell (plain-object plugin)
 *
 * No imports outside Node/Bun builtins so the module resolves under both
 * plugin loaders without a package.json or node_modules.
 *
 * Environment variables:
 *   AUTOLEARN_HOME     - Base directory (default: ~/.autolearn)
 *   AUTOLEARN_DISABLED - Set to "1" to disable
 *   AUTOLEARN_DEBUG    - Set to "1" for debug logging
 */

import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "fs"
import { spawn as nodeSpawn } from "child_process"
import { homedir } from "os"
import { join } from "path"

export const AL_HOME = process.env.AUTOLEARN_HOME || join(homedir(), ".autolearn")
export const PERSONAS_DIR = join(AL_HOME, "personas")
export const DEFAULT_PERSONA_DIR = join(PERSONAS_DIR, "default")
export const CONFIG_FILE = join(DEFAULT_PERSONA_DIR, "config.yaml")
export const MEMORY_FILE = join(DEFAULT_PERSONA_DIR, "memory.context.md")
export const LEGACY_MEMORY_FILE = join(DEFAULT_PERSONA_DIR, "memory.md")
export const USER_FILE = join(DEFAULT_PERSONA_DIR, "user-profile.md")
export const OBS_FILE = join(DEFAULT_PERSONA_DIR, "observations.jsonl")
export const BIN_DIR = join(DEFAULT_PERSONA_DIR, "bin")
export const REVIEWS_DIR = join(DEFAULT_PERSONA_DIR, "reviews")
export const SKILLS_DIR = join(DEFAULT_PERSONA_DIR, "skills")
export const ARCHIVE_DIR = join(SKILLS_DIR, ".archive")
export const WRAPPER_SCRIPT = join(BIN_DIR, "review-runner.sh")
export const SYNC_CONFIG_FILE = join(AL_HOME, "sync.yaml")
export const SALT_FILE = join(AL_HOME, ".encryption_salt")
export const AUTOLEARN_CLI = join(homedir(), ".agents", "skills", "autolearn-reviewer", "scripts", "autolearn.py")
export const THRESHOLD_DEFAULT = 5
export const STALE_DAYS_DEFAULT = 30
export const IDLE_COOLDOWN_MS = 300000
export const REVIEW_HEADING = "# Autolearn Review"
export const DEBUG = process.env.AUTOLEARN_DEBUG === "1"
export const DBG_FILE = join(AL_HOME, "debug.log")

export function dbg(...args) {
  if (!DEBUG) return
  const msg = args.map(a => typeof a === "string" ? a : JSON.stringify(a)).join(" ")
  try { appendFileSync(DBG_FILE, `[${new Date().toISOString()}] ${msg}\n`) } catch {}
}

// @spec CM-TC-006
export const SECRET_RE =
  /(api[_-]?key|token|secret|password|authorization|credentials?|auth)(["\s:=]+)([A-Za-z]+\s+)?([A-Za-z0-9_\-/.+=]{8,})/gi

// @spec CM-TC-006
export function redact(str) {
  if (!str) return str
  return str.replace(SECRET_RE, "$1$2$3[REDACTED]")
}

// @spec KS-MEM-001 (ensures directory tree exists before any operation)
export function ensureStore() {
  migrateToPersonas()
  mkdirSync(DEFAULT_PERSONA_DIR, { recursive: true })
  mkdirSync(BIN_DIR, { recursive: true })
  mkdirSync(SKILLS_DIR, { recursive: true })
  mkdirSync(ARCHIVE_DIR, { recursive: true })
  mkdirSync(REVIEWS_DIR, { recursive: true })
  if (!existsSync(MEMORY_FILE)) {
    writeFileSync(MEMORY_FILE, "# Autolearn Memory\n\n<!-- Managed by autolearn. -->\n\n")
  }
  if (!existsSync(USER_FILE)) {
    writeFileSync(USER_FILE, "# User Profile\n\n<!-- Managed by autolearn. -->\n\n")
  }
  if (!existsSync(CONFIG_FILE)) {
    writeFileSync(CONFIG_FILE, `review_threshold: ${THRESHOLD_DEFAULT}\nsession_review_on_idle: true\nmax_conversation_buffer: 50\ncurator_interval_days: 7\nstale_after_days: 30\narchive_after_days: 90\n`)
  }
  ensureWrapper()
}

// Phase 3 migration: move flat ~/.autolearn/ files to personas/default/
function migrateToPersonas() {
  if (existsSync(PERSONAS_DIR)) return
  const flatFiles = ["memory.md", "user-profile.md", "config.yaml", "observations.jsonl", "strengths.json", ".curator_state.json"]
  const hasFlat = flatFiles.some(f => { try { return existsSync(join(AL_HOME, f)) } catch { return false } })
  const hasSkills = existsSync(join(AL_HOME, "skills"))
  if (!hasFlat && !hasSkills) return

  mkdirSync(DEFAULT_PERSONA_DIR, { recursive: true })
  for (const f of flatFiles) {
    const src = join(AL_HOME, f)
    try {
      if (existsSync(src) && !statSync(src).isDirectory()) {
        renameSync(src, join(DEFAULT_PERSONA_DIR, f))
      }
    } catch {}
  }
  for (const d of ["skills", "reviews", "bin"]) {
    const srcDir = join(AL_HOME, d)
    try {
      if (existsSync(srcDir) && statSync(srcDir).isDirectory() && !existsSync(join(DEFAULT_PERSONA_DIR, d))) {
        renameSync(srcDir, join(DEFAULT_PERSONA_DIR, d))
      }
    } catch {}
  }
  dbg("MIGRATED flat layout to", DEFAULT_PERSONA_DIR)
}

// @spec SYNC-PROTO-012, SYNC-PROTO-013
export function syncBackground(command) {
  if (!process.env.AUTOLEARN_SYNC_API_KEY) return
  if (!existsSync(SYNC_CONFIG_FILE)) return
  if (!existsSync(SALT_FILE)) return
  if (!existsSync(AUTOLEARN_CLI)) return

  // Honor sync_on_start / sync_after_review config flags
  try {
    const syncYaml = readFileSync(SYNC_CONFIG_FILE, "utf-8")
    if (command === "pull" && /sync_on_start:\s*false/.test(syncYaml)) return
    if (command === "push" && /sync_after_review:\s*false/.test(syncYaml)) return
  } catch {}

  try {
    spawnDetached(["uv", "run", AUTOLEARN_CLI, "sync", command], { cwd: process.cwd() })
    dbg(`SYNC ${command} spawned in background`)
  } catch (err) {
    dbg(`SYNC ${command} failed to spawn:`, err.message)
  }
}

// Detached subprocess spawn that works under both OpenCode v1 (Bun runtime)
// and v2 (Bun-implemented Node compat). Bun.spawn is preferred where
// available to preserve v1 behavior exactly; child_process elsewhere.
// Pass { unref: true } for fire-and-forget children that must not keep the
// host's event loop alive (e.g. memory compose).
export function spawnDetached(cmd, opts = {}) {
  const { unref, ...spawnOpts } = opts
  if (typeof Bun !== "undefined" && typeof Bun.spawn === "function") {
    const proc = Bun.spawn(cmd, {
      stdout: "ignore",
      stderr: "ignore",
      stdin: "ignore",
      detached: true,
      ...spawnOpts,
      env: spawnOpts.env || { ...process.env },
    })
    try { unref ? proc.unref() : proc.ref() } catch {}
    return proc
  }
  const proc = nodeSpawn(cmd[0], cmd.slice(1), {
    stdio: "ignore",
    detached: true,
    ...spawnOpts,
    env: spawnOpts.env || { ...process.env },
  })
  try { proc.unref() } catch {}
  return proc
}

// The wrapper is version-aware: it prefers `opencode2` when present (or the
// binary named by AUTOLEARN_OPENCODE_BIN, set by the v2 plugin shell) and
// falls back to `opencode`. Session cleanup uses the v2 HTTP API when the
// selected binary is opencode2 (no `session delete` CLI subcommand in v2).
const WRAPPER_CONTENT = `#!/bin/sh
# Autolearn review runner - runs an opencode review, deletes the session,
# then pushes the updated store via sync (if configured).
# Works with OpenCode v1 (opencode) and v2 beta (opencode2).
# Args: passed directly to \`<binary> run --format json\`
OC="\${AUTOLEARN_OPENCODE_BIN:-}"
if [ -z "\$OC" ]; then
  if command -v opencode2 >/dev/null 2>&1; then OC=opencode2; else OC=opencode; fi
fi
OUT=\$(mktemp "\${TMPDIR:-/tmp}/alreview.XXXXXX")
"\$OC" run --format json "\$@" > "\$OUT" 2>/dev/null
SID=\$(sed -n 's/.*"sessionID"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "\$OUT" | head -1)
rm -f "\$OUT"
if [ -n "\$SID" ]; then
  case "\$(basename "\$OC")" in
    opencode2) "\$OC" api delete "/api/session/\$SID" >/dev/null 2>&1 ;;
    *)         "\$OC" session delete "\$SID" >/dev/null 2>&1 ;;
  esac
fi
# Push after review completes so reviewer-written changes are included.
# Stays silent when sync isn't configured (no API key or no salt).
if [ -n "\${AUTOLEARN_SYNC_API_KEY}" ] && [ -f "\${HOME}/.autolearn/.encryption_salt" ]; then
  uv run "\${HOME}/.agents/skills/autolearn-reviewer/scripts/autolearn.py" sync push >/dev/null 2>&1
fi
`

function ensureWrapper() {
  try {
    writeFileSync(WRAPPER_SCRIPT, WRAPPER_CONTENT)
    chmodSync(WRAPPER_SCRIPT, 0o755)
  } catch (err) {
    dbg("ensureWrapper failed:", err.message)
  }
}

export function parseConfig() {
  try {
    const content = readFileSync(CONFIG_FILE, "utf-8")
    const config = {}
    for (const line of content.split("\n")) {
      const match = line.match(/^(\w+):\s*(.+)/)
      if (match) {
        const [, key, raw] = match
        const val = raw.trim()
        config[key] = val === "true" ? true : val === "false" ? false : isNaN(val) ? val : Number(val)
      }
    }
    return config
  } catch {
    return { review_threshold: THRESHOLD_DEFAULT, session_review_on_idle: true, max_conversation_buffer: 50 }
  }
}

export function truncate(text, maxLen) {
  if (!text || text.length <= maxLen) return text || ""
  return text.slice(0, maxLen - 3) + "..."
}

// @spec MI-CMP-009, MI-CMP-010
export function injectInstructions() {
  try {
    const configPath = join(homedir(), ".config", "opencode", "opencode.json")
    if (!existsSync(configPath)) return
    const raw = readFileSync(configPath, "utf-8")
    const data = JSON.parse(raw)
    if (!data.instructions) data.instructions = []

    // Remove superseded memory instruction paths (flat-layout + persona memory.md).
    // Memory Insight loads the generated memory.context.md instead. Matches
    // both expanded absolute paths and literal-tilde forms.
    const oldMemoryFile = join(AL_HOME, "memory.md")
    const legacyForms = new Set([oldMemoryFile, LEGACY_MEMORY_FILE])
    try {
      legacyForms.add(join(homedir(), ".autolearn", "memory.md").replace(homedir(), "~"))
      legacyForms.add(LEGACY_MEMORY_FILE.replace(homedir(), "~"))
    } catch {}
    const hadSuperseded = data.instructions.some(p => legacyForms.has(p))
    let changed = hadSuperseded
    if (hadSuperseded) {
      data.instructions = data.instructions.filter(p => !legacyForms.has(p))
    }

    if (!data.instructions.includes(MEMORY_FILE)) {
      data.instructions.push(MEMORY_FILE)
      changed = true
    }
    if (changed) {
      writeFileSync(configPath, JSON.stringify(data, null, 2) + "\n")
    }
  } catch (err) {
    dbg("injectInstructions failed:", err.message)
  }
}

// @spec MI-CMP-009 — regenerate memory.context.md (runs migration on first call)
export function composeContext() {
  try {
    spawnDetached(["uv", "run", AUTOLEARN_CLI, "memory", "compose"], { unref: true })
    dbg("memory compose spawned")
  } catch (err) {
    dbg("memory compose failed to spawn:", err.message)
  }
}

export const MAX_OBS_LINES = 1000

// @spec KS-OBS-001, KS-OBS-002, KS-OBS-003
export function logObs(obs) {
  obs.timestamp = new Date().toISOString()
  try {
    // @spec KS-OBS-005
    appendFileSync(OBS_FILE, JSON.stringify(obs) + "\n")
    // @spec KS-OBS-004
    trimFile(OBS_FILE, MAX_OBS_LINES)
  } catch {
    // @spec KS-OBS-006
  }
}

// @spec KS-OBS-004
export function trimFile(filePath, maxLines) {
  try {
    const content = readFileSync(filePath, "utf-8")
    const lines = content.split("\n")
    if (lines.length <= maxLines) return
    const trimmed = lines.slice(-maxLines).join("\n")
    writeFileSync(filePath, trimmed)
    dbg("TRIMMED", filePath, "from", lines.length, "to", maxLines, "lines")
  } catch {}
}

// @spec CM-RS-006
export function formatReview(messages, meta = {}) {
  const { project = "unknown", trigger = "exit" } = meta
  let md = "# Autolearn Review\n\n"
  md += "## Context\n\n"
  md += `- Project: ${project}\n`
  md += `- Date: ${new Date().toISOString()}\n`
  md += `- Turns in this review: ${messages.length}\n`
  md += `- Trigger: ${trigger}\n\n`
  md += "## Instructions\n\n"
  md += 'Review the conversation below for learning opportunities.\nLoad the autolearn-reviewer skill with: skill({ name: "autolearn-reviewer" })\n\n'
  md += "Focus on:\n\n"
  md += "1. User corrections (style, approach, tools) — \"don't do X\", \"use Y instead\"\n"
  md += "2. User preferences AND declarative workflow specs — not just corrections.\n"
  md += "   The user may describe how they want something done without a mistake\n"
  md += "   being made first. Capture these too:\n"
  md += "   - \"they should be one post one week\" (cadence spec)\n"
  md += "   - \"we don't use global pip anywhere here\" (system-wide tool rule)\n"
  md += "   - \"LinkedIn should follow Bluesky schedule\" (sync rule)\n"
  md += "   - \"use PEP 723 inline metadata for Python scripts\" (convention)\n"
  md += "3. Workarounds or techniques that worked\n"
  md += "4. Skills that were wrong, incomplete, or outdated\n"
  md += "5. Repeated patterns worth capturing\n\n"
  md += "IMPORTANT: Preferences are not always corrections. Scan every user message\n"
  md += "for declarative specs (\"should be\", \"we use\", \"we don't\", \"I want\") even\n"
  md += "when no error occurred. Record general rules, not narrow instances.\n\n"
  md += "## Conversation\n\n"

  for (const msg of messages) {
    const label = msg.role === "user" ? "User" : "Assistant"
    md += `### ${label}\n\n${msg.content}\n\n`
  }

  md += "---\n\nTake action now.\n"
  return md
}

// @spec CM-RS-014
export function cleanStaleReviews(config) {
  try {
    const staleMs = (config.stale_after_days || STALE_DAYS_DEFAULT) * 86400000
    const now = Date.now()
    const files = []
    try {
      for (const f of readdirSync(REVIEWS_DIR)) {
        files.push(f)
      }
    } catch {
      return
    }
    for (const f of files) {
      if (!f.startsWith("review-")) continue
      const match = f.match(/review-(?:exit-)?(\d+)\.md/)
      if (!match) continue
      const fileTime = parseInt(match[1], 10)
      if (now - fileTime > staleMs) {
        try { unlinkSync(join(REVIEWS_DIR, f)); dbg("CLEANED STALE REVIEW", f) } catch {}
      }
    }
  } catch (err) {
    dbg("CLEAN STALE FAILED", err.message)
  }
}

/**
 * Spawn a review subprocess via the wrapper script.
 * `messageCount`, `project`, and `trigger` are recorded in the observation
 * log (spec CM-RS-013); pass `log: false` to skip observation logging
 * (the v1 exit-review path stays silent, matching original behavior).
 * Returns { ok, reviewFile, reviewMd } — reviewMd is set even on failure so
 * callers can write the fallback file.
 */
// @spec CM-RS-007..CM-RS-013
export function runReviewSubprocess({ reviewMd, filePrefix = "review", title, cwd, env, messageCount, project, trigger, log = true }) {
  // @spec CM-RS-007
  const reviewFile = join(REVIEWS_DIR, `${filePrefix}-${Date.now()}.md`)
  writeFileSync(reviewFile, reviewMd)
  dbg("REVIEW FILE WRITTEN", reviewFile)

  // @spec CM-RS-008, CM-RS-009, CM-RS-010
  const args = [reviewMd, "--agent", "autolearn-reviewer", "--title", title]
  spawnDetached([WRAPPER_SCRIPT, ...args], {
    cwd: cwd || process.cwd(),
    env: { ...process.env, AUTOLEARN_REVIEWER: "1", ...(env || {}) },
  })

  // @spec CM-RS-013
  if (log) {
    const obs = { type: "review_spawned", review_file: reviewFile }
    if (typeof messageCount === "number") obs.message_count = messageCount
    obs.project = project || "unknown"
    if (trigger) obs.trigger = trigger
    logObs(obs)
  }
  dbg("REVIEW SPAWNED OK via wrapper", reviewFile)

  // Note: sync push happens in the wrapper script AFTER the review
  // completes, not here — otherwise we'd push pre-review state.
  return { ok: true, reviewFile, reviewMd }
}
