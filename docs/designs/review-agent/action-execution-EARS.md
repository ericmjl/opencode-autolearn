# Action Execution - EARS

**Parent LLD**: ./LLD.md

## Observation Recording

- [x] **RA-AE-001**: When the reviewer identifies a strong signal, the reviewer shall record it in the behavioral-rule store via `improve.py observe` and via the durable mechanisms (`autolearn.py memory add`, `user add`, or `skill create/patch`) with the rule phrased as an imperative.
- [x] **RA-AE-002**: The reviewer shall assign a domain to each observation (e.g., python-tooling, git-practices, code-style) when identifiable.

## Memory Updates

- [x] **RA-AE-003**: When the reviewer identifies a broadly applicable lesson, the reviewer shall add it to memory via `autolearn.py memory add`.
- [x] **RA-AE-004**: Memory entries added by the reviewer shall be concise, actionable, and general (not session-specific).

## User Profile Updates

- [x] **RA-AE-005**: When the reviewer identifies a user preference about communication, workflow, or habits, the reviewer shall add it via `autolearn.py user add`.

## Skill Actions

- [x] **RA-AE-006**: The reviewer shall prefer patching an existing skill over creating a new one.
- [x] **RA-AE-007**: If no existing skill matches, the reviewer shall prefer adding a section to an existing umbrella skill.
- [x] **RA-AE-008**: If neither patching nor extending is appropriate, the reviewer shall create a new skill via `autolearn.py skill create`.
- [x] **RA-AE-009**: The reviewer shall not create more than 2 new skills per review.

## Safety Constraints

- [x] **RA-AE-010**: The reviewer shall not modify project source code — only write to `~/.autolearn/`.
- [x] **RA-AE-011**: The reviewer shall never write secrets, API keys, or credentials to memory or skills.
- [x] **RA-AE-012**: If unsure whether to record something, the reviewer shall lean toward not recording.

## Review Output

- [x] **RA-AE-013**: After completing all actions, the reviewer shall output a summary with counts of observations recorded, memory updated (yes/no), skills created, skills patched, and user profile updated (yes/no).
- [x] **RA-AE-014**: If nothing was found to record, the reviewer shall output "Autolearn review complete: nothing to record."

## Outcome Logging

- [x] **RA-AE-015**: After completing all actions (or determining nothing was recorded), the reviewer shall log a structured review-complete event to observations.jsonl via `autolearn.py log review-complete`, including topics found and actions taken.

## Related Documents

- [Review Agent LLD](./LLD.md)
