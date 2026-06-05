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

## Related Documents

- [Skill Management LLD](./LLD.md)
