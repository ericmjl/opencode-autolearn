# Memory Registry - EARS

**Parent LLD**: ./LLD.md

## Storage

- [ ] **MI-REG-001**: The system shall store all learned memories in a `memories.jsonl` file under the persona directory, one JSON record per line, with no character cap on total size.
- [ ] **MI-REG-002**: Each memory record shall carry: `id`, `text`, `type`, `created_at`, `reinforcements`, `last_reinforced`, `pinned`, `topics`, `status`, `evicted_at`, `retention_score`, `tier`, `scored_at`.
- [ ] **MI-REG-003**: The record `id` shall be the python-slugify of `text`, truncated to a stable length, and unique within the persona.
- [ ] **MI-REG-004**: The record `topics` field shall be derived from `text` by lowercasing, stripping punctuation and stopwords, and de-duplicating.

## Access API

- [ ] **MI-REG-005**: The system shall expose `MemoryRegistry.load()` returning all records and `load_active()` returning only `status == "active"` records.
- [ ] **MI-REG-006**: The system shall expose `add(text, type, pinned, topics)` that creates a record with `created_at` = today and `status` = active.
- [ ] **MI-REG-007**: The system shall expose `reinforce(id, when)` that appends a reinforcement date and updates `last_reinforced`; if the record was `evicted`, it shall flip `status` back to `active` and clear `evicted_at`.
- [ ] **MI-REG-008**: The system shall expose `update(record)` to write back computed fields (e.g. `retention_score`, `tier`, `scored_at`) without recreating the record.
- [ ] **MI-REG-009**: The system shall persist writes atomically by writing to a `.tmp` file and `os.replace`-ing into place.

## Migration

- [ ] **MI-REG-010**: When `memories.jsonl` does not exist for a persona, the first registry access shall trigger a one-time migration from the legacy `memory.md`, `user-profile.md`, and `strengths.json`.
- [ ] **MI-REG-011**: Migration shall create one record per legacy entry, setting `type` to `memory` or `user` based on source file, and deriving `created_at`/`reinforcements` from `strengths.json` where a matching slug exists.
- [ ] **MI-REG-012**: Migration shall be idempotent: re-running it shall not duplicate records if the registry already exists.
- [ ] **MI-REG-013**: Legacy `memory.md` strength records whose text was already trimmed from the file (orphans) shall be skipped, and the migration shall report the skip count.
- [ ] **MI-REG-014**: After a successful migration, the legacy `memory.md` shall be preserved on disk renamed to `memory.md.legacy` and shall no longer be loaded into agent context.
- [ ] **MI-REG-019**: Migration shall materialize the `memories.jsonl` file even when zero records are migrated, so that an empty registry is represented by an empty (but present) JSONL file rather than an absent one.

## Backward Compatibility

- [ ] **MI-REG-015**: Existing `memory add/remove/strengthen/weaken` commands shall operate against the registry (as thin wrappers) so reviewer-agent behaviour is preserved.
- [ ] **MI-REG-016**: `memory list` shall print the composed context view by default (see composer-EARS).

## Robustness

- [ ] **MI-REG-017**: If a `memories.jsonl` line is corrupt JSON, the system shall skip that line and log to `debug.log` rather than aborting.
- [ ] **MI-REG-018**: The system shall honour the `AUTOLEARN_HOME` environment variable and `--persona` flag for locating the registry, consistent with the existing knowledge store.

## Related Documents

- [Memory Insight LLD](./LLD.md)
