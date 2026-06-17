# Conversation Evaluation - EARS

**Parent LLD**: ./LLD.md

## Signal Detection

- [x] **RA-CE-001**: The reviewer shall evaluate each user message in the conversation for correction signals (e.g., "don't do X", "use Y instead", "that's wrong").
- [x] **RA-CE-002**: The reviewer shall evaluate each user message for explicit preference signals (e.g., "I prefer X", "always do Y", "from now on, Z").
- [x] **RA-CE-002a**: The reviewer shall evaluate each user message for declarative workflow specification signals — statements where the user describes how they want a recurring task or workflow to work, even when no mistake was made (e.g., "they should be one post one week", "we don't use global pip anywhere here", "LinkedIn should follow Bluesky schedule").
- [x] **RA-CE-003**: The reviewer shall evaluate each user message for frustration-about-repetition signals (e.g., "again?", "I keep telling you").
- [x] **RA-CE-004**: The reviewer shall evaluate the conversation for workarounds that resolved an issue (non-obvious techniques, debugging paths).

## Signal Classification

- [x] **RA-CE-005**: The reviewer shall classify strong signals (corrections, explicit preferences, declarative workflow specs, frustration, explicit remember instructions, successful workarounds) as always requiring action.
- [x] **RA-CE-006**: The reviewer shall classify moderate signals (tool choice patterns, code style, workflow patterns, skill gaps) as requiring action only when observed more than once.
- [x] **RA-CE-007**: The reviewer shall classify weak signals (contextual facts, environment details) as recordable but not worthy of skill creation.

## Generalization

- [x] **RA-CE-007a**: When the user states a rule with system-wide or project-wide scope ("anywhere", "on my system", "always", "every"), the reviewer shall record the general rule, not the specific instance that triggered it.

## Coverage Check

- [x] **RA-CE-007b**: Before concluding "nothing to record", the reviewer shall re-read each user message and confirm that each was either acted upon or consciously classified as below threshold. The reviewer shall not skip a user message solely because it is not a correction.

## Exclusion Filtering

- [x] **RA-CE-008**: The reviewer shall not capture one-time task instructions (e.g., "add a button", "rename this variable").
- [x] **RA-CE-009**: The reviewer shall not capture clarification questions.
- [x] **RA-CE-010**: The reviewer shall not capture negative claims about tools that could harden into agent refusals (e.g., "X is broken").

## Meta-Pattern Detection

- [x] **RA-CE-011**: Before concluding "nothing to record", the reviewer shall check for system-level meta-patterns: review cascades in observations.jsonl, previous "nothing to record" conclusions followed by user pushback, and operational debugging knowledge.

## Outcome Logging

- [x] **RA-CE-012**: After completing the review, the reviewer shall log a structured review-complete event to observations.jsonl, including topics found and actions taken. This creates an audit trail for detecting systematic capture gaps.

## Related Documents

- [Review Agent LLD](./LLD.md)
