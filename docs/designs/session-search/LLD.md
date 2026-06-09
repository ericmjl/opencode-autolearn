# Session Search - Low-Level Design

**Created**: 2026-06-09
**Status**: Approved

## Overview

Add FTS5 full-text search over past OpenCode sessions so the autolearn-reviewer can query historical conversations before concluding "nothing to record." This closes the gap where patterns not promoted to memory are lost after the conversation buffer is flushed.

## Design Decisions

### DD1: Separate SQLite database (not modifying opencode.db)

**Choice**: Create `~/.autolearn/search.db` with FTS5 virtual tables. Read from `opencode.db` but never write to it.

**Rationale**: OpenCode manages its own schema via Drizzle migrations. Modifying `opencode.db` risks conflicts. A separate database under autolearn's control avoids coupling and can be rebuilt from scratch at any time.

### DD2: Incremental indexing with high-water mark

**Choice**: Track the last indexed `time_created` from the `part` table. On each `search init` or `search query`, index only new parts since the last mark.

**Rationale**: With 285k+ parts, full rebuilds are expensive. Incremental indexing takes milliseconds for a typical session's worth of new messages.

### DD3: No separate LLM summarization step

**Choice**: Search returns matching messages with surrounding context (2 messages before/after each hit). The autolearn-reviewer agent itself is an LLM and processes the results directly.

**Rationale**: Hermes uses a separate LLM call for summarization because their agent loop is different. Our reviewer IS the LLM -- adding another summarization layer would be redundant and waste tokens.

### DD4: Index text parts only

**Choice**: Only index `part` rows where the JSON `data` field has `type: "text"`. Skip tool calls, reasoning, compaction, and patch parts.

**Rationale**: User corrections and preferences appear in text parts. Tool calls are structured data that don't benefit from full-text search. Indexing everything would bloat the FTS5 table with noise.

## Data Model

### search.db schema

```sql
-- High-water mark for incremental indexing
CREATE TABLE IF NOT EXISTS index_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- FTS5 virtual table over session text content
CREATE VIRTUAL TABLE IF NOT EXISTS session_text USING fts5(
    session_id,
    message_id,
    role,
    text,
    project,
    timestamp,
    content=session_text_content,
    content_rowid=rowid
);

-- Content table backing FTS5
CREATE TABLE IF NOT EXISTS session_text_content(
    rowid INTEGER PRIMARY KEY,
    session_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    role TEXT NOT NULL,
    text TEXT NOT NULL,
    project TEXT NOT NULL DEFAULT '',
    timestamp INTEGER NOT NULL
);

-- Metadata for indexed sessions (avoids re-indexing)
CREATE TABLE IF NOT EXISTS indexed_session(
    session_id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    project TEXT NOT NULL DEFAULT '',
    message_count INTEGER NOT NULL DEFAULT 0,
    time_created INTEGER NOT NULL,
    time_indexed INTEGER NOT NULL
);
```

## CLI Commands

### `autolearn search init`

Build or update the FTS5 index from opencode.db.

```bash
uv run autolearn.py search init [--full]
```

- Without `--full`: incremental (only new parts since last index)
- With `--full`: drop and rebuild everything
- Reads from `~/.local/share/opencode/opencode.db`
- Writes to `~/.autolearn/search.db`

### `autolearn search query <terms>`

Search for messages matching the given FTS5 query terms.

```bash
uv run autolearn.py search query "docker networking fix"
uv run autolearn.py search query "NEAR(python testing)" 
uv run autolearn.py search query "user corrections about pytest" --limit 10 --context 3
```

Options:
- `--limit N`: Max results (default 5)
- `--context N`: Number of surrounding messages per hit (default 2)
- `--session <id>`: Restrict to a specific session
- `--project <name>`: Restrict to a specific project

Output format (markdown, designed for reviewer consumption):

```
## Search Results: "docker networking fix"

### Session: fixing-ci-pipeline (ses_abc123) — 2026-05-20

**User** (match, rank 0.92):
> I keep telling you, the Docker networking issue was the DNS config not the port mapping

**Assistant** (context):
> Let me check the port mapping in docker-compose...

**Assistant** (context):
> Found it — the DNS config in resolv.conf was pointing to the wrong nameserver

---

3 results across 2 sessions (ranked by relevance)
```

### `autolearn search sessions <terms>`

Search session titles and return matching sessions.

```bash
uv run autolearn.py search sessions "refactor"
```

Output: list of sessions with title, date, project, message count.

### `autolearn search status`

Show index status.

```bash
uv run autolearn.py search status
```

Output:
```
Index status:
  Sessions indexed: 2,558
  Messages indexed: 79,948
  Text parts indexed: 142,300
  Last indexed: 2026-06-09T14:30:00
  Database size: 45 MB
```

## Indexing Algorithm

```
function incremental_index():
    last_mark = read index_state['last_part_time']
    
    db = sqlite3.connect(opencode_db)
    search_db = sqlite3.connect(search_db)
    
    # Find new parts
    new_parts = db.execute("""
        SELECT p.id, p.message_id, p.session_id, p.time_created, p.data, m.data as msg_data
        FROM part p
        JOIN message m ON m.id = p.message_id
        WHERE p.time_created > ?
        ORDER BY p.time_created ASC
    """, [last_mark or 0])
    
    for part in new_parts:
        data = json.loads(part.data)
        if data.get('type') != 'text': continue
        
        msg_data = json.loads(part.msg_data)
        role = msg_data.get('role', 'unknown')
        text = data.get('text', '')
        if not text.strip(): continue
        
        # Get session project name
        session = get_session_info(part.session_id)
        
        insert into session_text_content(...)
        insert into indexed_session(...)
        
        update index_state['last_part_time'] = part.time_created
```

## Integration with autolearn-reviewer

Add a new step between Step 1 (Evaluate) and Step 2 (Record observations) in the SKILL.md:

### Step 1.5: Search past sessions

Before concluding "nothing to record," search past conversations for related patterns:

```bash
uv run $HOME/.agents/skills/autolearn-reviewer/scripts/autolearn.py search query "<key terms from conversation>"
```

When to search:
- The reviewer is uncertain whether a pattern is new or recurring
- The user expressed frustration about repetition ("I keep saying this")
- The reviewer is about to conclude "nothing to record" but the topic seems familiar

What to do with results:
- If past sessions show the same correction was needed before: treat as a **strong signal** (reinforce existing memory)
- If past sessions reveal a pattern the reviewer missed: record it as a new observation
- If no relevant past sessions: proceed normally

Safety: limit search to 5 results with 2 messages of context to avoid overwhelming the reviewer's context window.

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| opencode.db schema changes break indexing | Index reads use stable columns (id, time_created, data). Schema changes would need to rename/drop these columns, which is unlikely. |
| Large search.db on disk | FTS5 adds ~30% overhead over raw text. With ~142k text parts averaging 500 chars, expect ~50-80 MB. Acceptable. |
| Slow incremental indexing | High-water mark means only new parts are processed. Typical: <100 new parts per session. |
| Search returns too many results | Default limit of 5 with context. Reviewer can increase if needed. |
| Stale index after opencode.db cleanup | `search init --full` rebuilds from scratch. Can be run weekly by the curator. |
