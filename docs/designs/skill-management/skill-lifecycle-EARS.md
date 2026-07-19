# Skill Lifecycle - EARS

**Parent LLD**: ./LLD.md

## Curator Execution

- [x] **SM-LC-001**: When `curator run` is invoked, the system shall evaluate all skills in `.usage.json` for lifecycle transitions.
- [x] **SM-LC-002**: The system shall transition active skills to "stale" if their last_activity_at is older than `stale_after_days` (default 30).
- [x] **SM-LC-003**: The system shall transition stale (or active) skills to "archived" if their last_activity_at is older than `archive_after_days` (default 90).
- [x] **SM-LC-004**: When transitioning a skill to "archived", the system shall move its directory to `skills/.archive/`.

## Curator Exemptions

- [x] **SM-LC-005**: The system shall not transition skills that are already archived.
- [x] **SM-LC-006**: The system shall not transition skills where `pinned` is true.
- [x] **SM-LC-007**: The system shall not transition skills where `created_by` is not "autolearn".

## Curator State Tracking

- [x] **SM-LC-008**: The system shall record each curator run in `.curator_state.json` with the date and a breakdown of transitions by type (stale, archived, active).
- [x] **SM-LC-009**: The system shall update the `last_run` field in `.curator_state.json` after each run.

## Curator Status

- [x] **SM-LC-010**: When `curator status` is invoked, the system shall print the count of active, stale, and archived skills, the last run date, and total run count.

## Curator Output

- [x] **SM-LC-011**: If no transitions are needed, the system shall print "Curator run complete: no transitions needed."
- [x] **SM-LC-012**: If transitions occur, the system shall print each transition type with the affected skill names.

## Usage Tracking Repair

The `repair_skill_use_counts()` side-effect of `curator run` keeps `.usage.json`'s `use_count` and `last_activity_at` fields in sync with the authoritative outcome index (CP-OUT-005). These requirements govern the extension that brings previously-untracked, user-installed skills under telemetry coverage without subjecting them to lifecycle management.

- [ ] **SM-LC-013**: When `curator run` invokes `repair_skill_use_counts()`, the system SHALL scan all configured skill-discovery directories for `SKILL.md` files whose skill name is not present in `.usage.json`.
- [ ] **SM-LC-014**: For each on-disk skill not in `.usage.json` that has been loaded at least once (count > 0 in the outcome index), the system SHALL add a tracking entry with `created_by: "tracked-manual"`, `state: "active"`, `created_at` derived from the `SKILL.md` file mtime, `use_count` copied from the index, and `last_activity_at` derived from the most recent `tool='skill'` part timestamp.
- [ ] **SM-LC-015**: The disk scan SHALL skip any directory whose name starts with `.archive` (matches `.archive/`, `.archive-manual/`, etc.), so previously-archived manual skills are not resurrected into `.usage.json`.
- [ ] **SM-LC-016**: When updating an existing `.usage.json` entry, the system SHALL NOT modify the `created_by` field. Only `use_count` and `last_activity_at` are refreshed.
- [ ] **SM-LC-017**: The retention/lifecycle transition loop SHALL continue to skip any entry whose `created_by` is not `"autolearn"`, including the new `"tracked-manual"` entries introduced by SM-LC-014. `tracked-manual` skills are observe-only: tracked for usage, never auto-archived.

## Related Documents

- [Skill Management LLD](./LLD.md)
