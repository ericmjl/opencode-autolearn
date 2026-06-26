# Context Composer - EARS

**Parent LLD**: ./LLD.md

## Generation

- [ ] **MI-CMP-001**: The `memory compose` command shall produce a markdown file at `<persona_dir>/memory.context.md` in the existing `# Autolearn Memory` bullet format so `opencode.json` instruction loading is unchanged.
- [ ] **MI-CMP-002**: The composer shall select from active, non-evicted registry records only.
- [ ] **MI-CMP-003**: The composer shall force-include every `pinned` record before any ranked record.
- [ ] **MI-CMP-004**: Non-pinned records shall be ranked by `relevance × retention_score` and appended greedily in descending order.
- [ ] **MI-CMP-005**: The composer shall stop appending once total entry characters reach `context_budget_chars`, except pinned records which are always emitted even if the budget is exceeded.

## Relevance

- [ ] **MI-CMP-006**: Relevance shall be computed as Jaccard overlap between the record's (`topics` ∪ text-tokens) and the session context token set.
- [ ] **MI-CMP-007**: The session context tokens shall come from the `--context` CLI flag; when no context is supplied, ranking shall fall back to retention-only (hottest first).

## Integration

- [ ] **MI-CMP-008**: When the registry is empty, the composer shall write a minimal valid `memory.context.md` containing only the header.
- [ ] **MI-CMP-009**: The OpenCode plugin shall regenerate `memory.context.md` via `memory compose` on session start and after each review, passing project name + first user message as `--context`.
- [ ] **MI-CMP-010**: The `opencode.json` instructions entry shall be migrated from `memory.md` to `memory.context.md` automatically on first run after upgrade.

## Related Documents

- [Memory Insight LLD](./LLD.md)
