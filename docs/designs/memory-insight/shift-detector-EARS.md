# Shift Detector (Recurring Preferences) - EARS

**Parent LLD**: ./LLD.md

## Signal Capture

- [ ] **MI-SFT-001**: The system shall detect candidate correction/preference utterances using lexical cues (`don't`, `always`, `never`, `should`, `prefer`, `again`, `I keep`, imperative leads) — no embeddings.
- [ ] **MI-SFT-002**: For each candidate utterance the system shall compute a topic signature = stable hash of the normalized token set (lowercased, punctuation/stopwords stripped).
- [ ] **MI-SFT-003**: The system shall append one sighting row per (topic signature × session) to `topics.jsonl` with `tokens`, `session_id`, `date`, `count`, and a short `text_sample`.

## Trend Detection

- [ ] **MI-SFT-004**: Per topic signature, the system shall compute `SW` = mean count over the last `shift_window` sessions and `EMA ← shift_beta·EMA + (1−shift_beta)·count`.
- [ ] **MI-SFT-005**: The system shall compute `divergence = |SW − EMA|` and `direction = rising` when SW > EMA, else `falling`.
- [ ] **MI-SFT-006**: A candidate shall be created/upserted when the topic has been sighted in at least `shift_min_sessions` distinct sessions AND **either** `divergence ≥ shift_divergence_threshold` (acceleration) **or** `SW ≥ shift_recurrence_floor` (steady recurrence). The recurrence-floor branch is what catches the literal "I keep saying this" case, which pure divergence (steady ⇒ divergence≈0) would miss.

## Action

- [ ] **MI-SFT-007**: When a rising topic matches an existing memory record (by token overlap), the system shall auto-`reinforce` that record rather than creating a candidate.
- [ ] **MI-SFT-008**: When a rising topic is novel, the system shall write a `pending` candidate to `candidates.jsonl` (capped at `shift_max_candidates` pending) for UI surfacing.
- [ ] **MI-SFT-009**: When a previously rising topic turns falling, the system shall mark it as a "learned" entry surfaced in the UI feed (the closed-loop success signal).

## CLI

- [ ] **MI-SFT-010**: The `topics scan` command shall run capture + trend detection over recent sessions and update `candidates.jsonl`.
- [ ] **MI-SFT-011**: The `topics candidates` command shall list pending candidates with SW, EMA, divergence, and sample utterances.

## Triggers

- [ ] **MI-SFT-012**: The shift detector shall be invokable from the reviewer cycle and the weekly curator, using the existing `search.db` / session data as its source of sightings.

## Related Documents

- [Memory Insight LLD](./LLD.md)
