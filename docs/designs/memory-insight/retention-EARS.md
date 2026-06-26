# Retention (Ebbinghaus) - EARS

**Parent LLD**: ./LLD.md

## Scoring

- [ ] **MI-RTN-001**: The system shall compute a retention score in [0,1] for each active memory as `min(1, salience * exp(-retention_lambda * days_since_created) + retention_sigma * Σ(1 / days_since_each_reinforcement))`.
- [ ] **MI-RTN-002**: The `salience` term shall equal `base_salience[type] + min(0.2, len(reinforcements) * 0.02)`, where `base_salience` is `retention_salience_memory` for type=memory and `retention_salience_user` for type=user.
- [ ] **MI-RTN-003**: When computing the reinforcement boost, the system shall skip any reinforcement whose age is 0 days to avoid division by zero.
- [ ] **MI-RTN-004**: The system shall derive each record's tier from its score: `hot` ≥ `tier_hot`, `warm` ≥ `tier_warm`, `cold` ≥ `tier_cold`, else `evictable`.
- [ ] **MI-RTN-005**: The `retention score` command shall write `retention_score`, `tier`, and `scored_at` (today) back onto every active record and return a per-tier summary.

## Eviction

- [ ] **MI-RTN-006**: The system shall only consider a record evictable for removal if its tier is `evictable` AND it has remained below the cold threshold continuously for at least `eviction_grace_days`.
- [ ] **MI-RTN-007**: The `retention evict` command shall flip matching records' `status` to `evicted` and set `evicted_at` to today; it shall support a `--dry-run` flag that reports candidates without mutating.
- [ ] **MI-RTN-008**: Evicted records shall remain in `memories.jsonl` (for UI history) but shall be excluded from the context composer.

## Curve (for the UI)

- [ ] **MI-RTN-009**: The system shall expose `curve_points(record, config, days)` returning a list of `(date, score)` samples suitable for rendering a retention-over-time sparkline, modelling the decay and reinforcement bump-up events.

## Configuration

- [ ] **MI-RTN-010**: All retention behaviour shall be governed by `config.yaml` keys: `retention_lambda`, `retention_sigma`, `retention_salience_memory`, `retention_salience_user`, `tier_hot`, `tier_warm`, `tier_cold`, `eviction_grace_days`, each with the defaults documented in the LLD.

## Related Documents

- [Memory Insight LLD](./LLD.md)
