/**
 * Autolearn Plugin v2 - OpenCode Self-Improvement Engine
 *
 * Counts conversation turns and spawns a review subagent at thresholds.
 * Manages persistent memory at ~/.autolearn/memory.md.
 *
 * Environment variables:
 *   AUTOLEARN_HOME     - Base directory (default: ~/.autolearn)
 *   AUTOLEARN_DISABLED - Set to "1" to disable
 *   AUTOLEARN_DEBUG    - Set to "1" for debug logging
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from "fs"
import { homedir } from "os"
import { join } from "path"

const AL_HOME = process.env.AUTOLEARN_HOME || join(homedir(), ".autolearn")
const CONFIG_FILE = join(AL_HOME, "config.yaml")
const MEMORY_FILE = join(AL_HOME, "memory.md")
const USER_FILE = join(AL_HOME, "user-profile.md")
const OBS_FILE = join(AL_HOME, "observations.jsonl")
const REVIEWS_DIR = join(AL_HOME, "reviews")
const SKILLS_DIR = join(AL_HOME, "skills")
const ARCHIVE_DIR = join(SKILLS_DIR, ".archive")
const THRESHOLD_DEFAULT = 5
const STALE_DAYS_DEFAULT = 30
const IDLE_COOLDOWN_MS = 300000
const REVIEW_HEADING = "# Autolearn Review"
const DEBUG = process.env.AUTOLEARN_DEBUG === "1"
const DBG_FILE = join(AL_HOME, "debug.log")

function dbg(...args) {
  if (!DEBUG) return
  const msg = args.map(a => typeof a === "string" ? a : JSON.stringify(a)).join(" ")
  try { appendFileSync(DBG_FILE, `[${new Date().toISOString()}] ${msg}\n`) } catch {}
}

// @spec CM-TC-006
const SECRET_RE =
  /(api[_-]?key|token|secret|password|authorization|credentials?|auth)(["\s:=]+)([A-Za-z]+\s+)?([A-Za-z0-9_\-/.+=]{8,})/gi

// @spec CM-TC-006
function redact(str) {
  if (!str) return str
  return str.replace(SECRET_RE, "$1$2$3[REDACTED]")
}

// @spec KS-MEM-001 (ensures directory tree exists before any operation)
function ensureStore() {
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
}

function parseConfig() {
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

function truncate(text, maxLen) {
  if (!text || text.length <= maxLen) return text || ""
  return text.slice(0, maxLen - 3) + "..."
}

// @spec CM-MEM-001
function injectInstructions() {
  try {
    const configPath = join(homedir(), ".config", "opencode", "opencode.json")
    if (!existsSync(configPath)) return
    const raw = readFileSync(configPath, "utf-8")
    const data = JSON.parse(raw)
    if (!data.instructions) data.instructions = []
    if (!data.instructions.includes(MEMORY_FILE)) {
      data.instructions.push(MEMORY_FILE)
      writeFileSync(configPath, JSON.stringify(data, null, 2) + "\n")
    }
  } catch (err) {
    dbg("injectInstructions failed:", err.message)
  }
}

const GUARD = Symbol.for("opencode:autolearn")

// @spec CM-GUARD-001
export const AutolearnPlugin = async (ctx) => {
  if (process.env.AUTOLEARN_DISABLED === "1") return {}
  if (process.env.AUTOLEARN_REVIEWER === "1") {
    dbg("SKIPPING: reviewer session, not counting turns")
    return {}
  }

  const { client, directory, worktree } = ctx
  ensureStore()
  const config = parseConfig()

  // @spec CM-GUARD-002
  const isPrimary = !globalThis[GUARD]
  if (isPrimary) globalThis[GUARD] = true
  if (!isPrimary) {
    dbg("SKIPPING: secondary plugin instance, guard already set")
    return {}
  }

  dbg("PLUGIN LOADED", { isPrimary, hasClient: !!client, hasSession: !!(client?.session), directory })

  let turnCount = 0
  let lastReviewTurn = 0
  let lastIdleReview = 0
  let buffer = []
  let currentSessionId = null
  let reviewInProgress = false

  const messageTexts = new Map()
  const messageRoles = new Map()

  const projectName = () => (directory || worktree || process.cwd()).split("/").pop() || "unknown"

  injectInstructions()

  // @spec CM-RS-003, CM-RS-004, CM-RS-005
  async function spawnReview() {
    if (buffer.length === 0 || reviewInProgress) return
    const reviewText = buffer.map(m => m.content).join(" ")
    if (reviewText.includes(REVIEW_HEADING)) {
      dbg("SKIPPING: buffer contains review content (depth guard)")
      buffer = []
      return
    }
    reviewInProgress = true
    // @spec CM-BUF-003
    const captured = [...buffer]
    buffer = []

    dbg("SPAWN REVIEW", captured.length, "messages")

    const reviewMd = formatReview(captured)

    try {
      // @spec CM-RS-007
      const reviewFile = join(REVIEWS_DIR, `review-${Date.now()}.md`)
      writeFileSync(reviewFile, reviewMd)
      dbg("REVIEW FILE WRITTEN", reviewFile)

      // @spec CM-RS-008, CM-RS-009, CM-RS-010
      const args = ["run", reviewMd, "--agent", "autolearn-reviewer", "--title", "autolearn review"]

      const proc = Bun.spawn(["opencode", ...args], {
        stdout: "ignore",
        stderr: "ignore",
        detached: true,
        cwd: directory || worktree || process.cwd(),
        env: { ...process.env, AUTOLEARN_REVIEWER: "1" },
      })
      proc.ref()

      // @spec CM-RS-013
      logObs({ type: "review_spawned", message_count: captured.length, review_file: reviewFile })
      dbg("REVIEW SPAWNED OK via opencode run", reviewFile)

      // @spec CM-RS-014
      cleanStaleReviews()
    } catch (err) {
      // @spec CM-RS-011, CM-RS-012
      dbg("REVIEW SPAWN FAILED", err.message)
      console.error("[autolearn] Review spawn failed:", err.message)
      const fallback = join(AL_HOME, `review-failed-${Date.now()}.md`)
      writeFileSync(fallback, reviewMd)
    } finally {
      // @spec CM-RS-005
      reviewInProgress = false
    }
  }

  function cleanStaleReviews() {
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
        const match = f.match(/review-(\d+)\.md/)
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

  // @spec CM-RS-006
  function formatReview(messages) {
    let md = "# Autolearn Review\n\n"
    md += "## Context\n\n"
    md += `- Project: ${projectName()}\n`
    md += `- Date: ${new Date().toISOString()}\n`
    md += `- Turns in this review: ${messages.length}\n`
    md += `- Trigger: exit\n\n`
    md += "## Instructions\n\n"
    md += 'Review the conversation below for learning opportunities.\nLoad the autolearn-reviewer skill with: skill({ name: "autolearn-reviewer" })\n\n'
    md += "Focus on:\n\n"
    md += "1. User corrections (style, approach, tools)\n"
    md += "2. User preferences expressed\n"
    md += "3. Workarounds or techniques that worked\n"
    md += "4. Skills that were wrong, incomplete, or outdated\n"
    md += "5. Repeated patterns worth capturing\n\n"
    md += "## Conversation\n\n"

    for (const msg of messages) {
      const label = msg.role === "user" ? "User" : "Assistant"
      md += `### ${label}\n\n${msg.content}\n\n`
    }

    md += "---\n\nTake action now.\n"
    return md
  }

  // @spec CM-RS-016, CM-RS-017, CM-RS-018, CM-RS-019
  function spawnExitReview() {
    if (buffer.length <= 2) return
    const reviewText = buffer.map(m => m.content).join(" ")
    if (reviewText.includes(REVIEW_HEADING)) return

    const captured = [...buffer]
    buffer = []

    try {
      const reviewMd = formatReview(captured)
      const reviewFile = join(REVIEWS_DIR, `review-exit-${Date.now()}.md`)
      writeFileSync(reviewFile, reviewMd)

      const args = ["run", reviewMd, "--agent", "autolearn-reviewer", "--title", "autolearn exit review"]
      Bun.spawn(["opencode", ...args], {
        stdout: "ignore",
        stderr: "ignore",
        detached: true,
        cwd: directory || worktree || process.cwd(),
        env: { ...process.env, AUTOLEARN_REVIEWER: "1" },
      })

      dbg("EXIT REVIEW SPAWNED", captured.length, "messages")
    } catch (err) {
      dbg("EXIT REVIEW FAILED", err.message)
    }
  }

  // @spec CM-RS-016
  process.on("beforeExit", () => {
    dbg("beforeExit — spawning exit review")
    spawnExitReview()
  })

  // @spec CM-RS-017
  let exitHandlersInstalled = false
  if (!exitHandlersInstalled) {
    exitHandlersInstalled = true
    const signals = ["SIGINT", "SIGTERM"]
    for (const sig of signals) {
      process.on(sig, () => {
        dbg(`${sig} received — spawning exit review`)
        spawnExitReview()
        process.exit(0)
      })
    }
  }

  const MAX_OBS_LINES = 1000

  // @spec KS-OBS-001, KS-OBS-002, KS-OBS-003
  function logObs(obs) {
    obs.timestamp = new Date().toISOString()
    obs.project = projectName()
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
  function trimFile(filePath, maxLines) {
    try {
      const content = readFileSync(filePath, "utf-8")
      const lines = content.split("\n")
      if (lines.length <= maxLines) return
      const trimmed = lines.slice(-maxLines).join("\n")
      writeFileSync(filePath, trimmed)
      dbg("TRIMMED", filePath, "from", lines.length, "to", maxLines, "lines")
    } catch {}
  }

  return {
    event: async ({ event }) => {
      try {
        const props = event.properties || {}

        switch (event.type) {
          case "session.created": {
            const info = props.info || {}
            currentSessionId = info.id || props.sessionID
            dbg("SESSION CREATED", currentSessionId)
            break
          }

          case "message.updated": {
            const info = props.info || {}
            const msgId = info.id
            const role = info.role

            if (!msgId || !role) break

            // @spec CM-TC-003
            messageRoles.set(msgId, role)

            const text = messageTexts.get(msgId) || ""
            if (text && role === "assistant") {
              // @spec CM-TC-005, CM-TC-001
              const content = redact(truncate(text, 2000))
              turnCount++
              // @spec CM-BUF-001
              buffer.push({ role: "assistant", content, timestamp: new Date().toISOString() })
              dbg("ASSISTANT TURN", turnCount, content.length, "chars")

              // @spec CM-RS-001, CM-RS-002
              const threshold = config.review_threshold || THRESHOLD_DEFAULT
              if (turnCount - lastReviewTurn >= threshold) {
                lastReviewTurn = turnCount
                dbg("TRIGGERING REVIEW at turn", turnCount)
                spawnReview().catch(e => {
                  dbg("SPAWN REVIEW UNHANDLED", e.message)
                  reviewInProgress = false
                })
              }
            } else if (text && role === "user") {
              // @spec CM-TC-004
              const content = redact(truncate(text, 1000))
              // @spec CM-BUF-001
              buffer.push({ role: "user", content, timestamp: new Date().toISOString() })
              dbg("USER MESSAGE", content.length, "chars")
            }

            // @spec CM-BUF-002
            const maxBuf = config.max_conversation_buffer || 50
            if (buffer.length > maxBuf) buffer = buffer.slice(-maxBuf)

            messageTexts.delete(msgId)
            break
          }

          case "message.part.updated": {
            const part = props.part || {}
            const msgId = part.messageID
            if (!msgId || part.type !== "text") break

            const text = part.text || ""
            if (text && !messageTexts.has(msgId)) {
              messageTexts.set(msgId, text)
            }
            break
          }

          case "message.part.delta": {
            const msgId = props.messageID
            const delta = props.delta || ""
            if (!msgId || !delta) break

            // @spec CM-TC-002
            const existing = messageTexts.get(msgId) || ""
            messageTexts.set(msgId, existing + delta)
            break
          }

          // @spec CM-IDLE-001, CM-IDLE-002, CM-IDLE-003, CM-IDLE-004
          case "session.idle": {
            const now = Date.now()
            const cooldown = config.idle_cooldown_ms || IDLE_COOLDOWN_MS
            dbg("SESSION IDLE buffer=", buffer.length, "reviewInProgress=", reviewInProgress, "cooldownRemaining=", Math.max(0, cooldown - (now - lastIdleReview)))
            if (
              config.session_review_on_idle !== false &&
              buffer.length > 2 &&
              !reviewInProgress &&
              now - lastIdleReview >= cooldown
            ) {
              lastIdleReview = now
              spawnReview().catch(e => {
                dbg("IDLE REVIEW UNHANDLED", e.message)
                reviewInProgress = false
              })
            }
            break
          }
        }
      } catch (err) {
        dbg("EVENT ERROR", err.message)
        console.error("[autolearn] Event error:", err.message)
      }
    },
  }
}

export default AutolearnPlugin
