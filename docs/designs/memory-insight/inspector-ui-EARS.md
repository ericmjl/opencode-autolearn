# Inspector UI - EARS

**Parent LLD**: ./LLD.md

## Launch

- [ ] **MI-UI-001**: The `ui` command shall start a local HTTP server and open the user's browser to it, printing the chosen URL.
- [ ] **MI-UI-002**: If the requested `--port` is in use, the system shall increment the port up to +10 until a free one is found and use that.
- [ ] **MI-UI-003**: The `--no-browser` flag shall suppress automatic browser opening while still starting the server and printing the URL.
- [ ] **MI-UI-004**: The server shall be implemented with the Python standard library only (no Flask/FastAPI/React), serving a single embedded HTML page with vanilla JS and inline SVG.

## Read Views

- [ ] **MI-UI-005**: The Overview view shall show bucket counts (hot/warm/cold/evictable), pending candidate count, "learned" count, and orphan/migration-skip warnings.
- [ ] **MI-UI-006**: The Memories view shall list all registry records with text, type, strength, retention score, tier, and a trend indicator, sortable by tier and trend.
- [ ] **MI-UI-007**: The Memory detail view shall render the Ebbinghaus retention curve as an inline SVG sparkline using `curve_points`, plus reinforcement history and projected days-to-evictable.
- [ ] **MI-UI-008**: The Candidates view shall list pending rising topics with SW vs EMA, divergence, sample utterances, and confirm/dismiss controls.
- [ ] **MI-UI-009**: The Learned view shall list falling topics (successful learnings) as the closed-loop feedback signal.
- [ ] **MI-UI-010**: The Skills and Activity views shall reuse existing `skill list/usage` and `observations.jsonl` data respectively.

## Write Actions

- [ ] **MI-UI-011**: A POST to `/api/memory/{id}/strengthen` shall reinforce the record and recompute its score/tier.
- [ ] **MI-UI-012**: A POST to `/api/candidate/{id}/confirm` shall promote the candidate to a memory record and mark the candidate `confirmed`.
- [ ] **MI-UI-013**: A POST to `/api/candidate/{id}/dismiss` shall mark the candidate `dismissed` without creating a memory.

## Robustness

- [ ] **MI-UI-014**: The UI shall read the live registry files directly on each request (no stale cache), so changes from the reviewer or CLI appear on refresh.
- [ ] **MI-UI-015**: The UI shall be read-only by default for unauthenticated local use; write endpoints shall not require auth but shall be local-loopback only.

## Related Documents

- [Memory Insight LLD](./LLD.md)
