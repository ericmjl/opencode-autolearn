# Conversation Evaluation - EARS

**Parent LLD**: ./LLD.md

## Signal Detection

- [x] **RA-CE-001**: The reviewer shall evaluate each user message in the conversation for correction signals (e.g., "don't do X", "use Y instead", "that's wrong").
- [x] **RA-CE-002**: The reviewer shall evaluate each user message for explicit preference signals (e.g., "I prefer X", "always do Y", "from now on, Z").
- [x] **RA-CE-002a**: The reviewer shall evaluate each user message for declarative workflow specification signals — statements where the user describes how they want a recurring task or workflow to work, even when no mistake was made (e.g., "they should be one post one week", "we don't use global pip anywhere here", "LinkedIn should follow Bluesky schedule").
- [x] **RA-CE-003**: The reviewer shall evaluate each user message for frustration-about-repetition signals (e.g., "again?", "I keep telling you").
- [x] **RA-CE-004**: The reviewer shall evaluate the conversation for workarounds that resolved an issue (non-obvious techniques, debugging paths).
- [x] **RA-CE-004a**: The reviewer shall evaluate the conversation for conditionalized failure diagnoses — dead-end paths where the agent or user determined WHY something failed, stated with all three of (a) trigger condition, (b) root-cause reason, (c) fix or workaround — even when the path did not produce a success. The reason something didn't work is denser than the reason something did.

## Signal Classification

- [x] **RA-CE-005**: The reviewer shall classify strong signals (corrections, explicit preferences, declarative workflow specs, frustration, explicit remember instructions, successful workarounds, **conditionalized failure diagnoses**) as always requiring action.
- [x] **RA-CE-006**: The reviewer shall classify moderate signals (tool choice patterns, code style, workflow patterns, skill gaps) as requiring action only when observed more than once.
- [x] **RA-CE-007**: The reviewer shall classify weak signals (contextual facts, environment details) as recordable but not worthy of skill creation.

## Generalization

- [x] **RA-CE-007a**: When the user states a rule with system-wide or project-wide scope ("anywhere", "on my system", "always", "every"), the reviewer shall record the general rule, not the specific instance that triggered it.

## Coverage Check

- [x] **RA-CE-007b**: Before concluding "nothing to record", the reviewer shall re-read each user message and confirm that each was either acted upon or consciously classified as below threshold. The reviewer shall not skip a user message solely because it is not a correction.

## Exclusion Filtering

- [x] **RA-CE-008**: The reviewer shall not capture one-time task instructions (e.g., "add a button", "rename this variable").
- [x] **RA-CE-009**: The reviewer shall not capture clarification questions.
- [x] **RA-CE-010**: The reviewer shall not capture BARE negative claims about tools that could harden into over-generalized agent refusals (e.g., "X is broken", "don't use X" stated without a condition, a root cause, or a workaround).
- [x] **RA-CE-010a**: The reviewer SHALL capture conditionalized failure diagnoses — "X fails WHEN `<condition>` BECAUSE `<root cause>`; workaround is `<Y>`" — as strong signals (per RA-CE-004a/RA-CE-005). A conditionalized negative is a guardrail with an escape hatch, not a refusal. The test: if the trigger condition AND the workaround can both be stated, capture it; otherwise skip it. (Refined 2026-07-11 after Junpeng Lao flagged that autolearn was skipping all failure paths; see https://junpenglao.xyz/writing/at-the-edge-of-what-you-know/)

## Meta-Pattern Detection

- [x] **RA-CE-011**: Before concluding "nothing to record", the reviewer shall check for system-level meta-patterns: review cascades in observations.jsonl, previous "nothing to record" conclusions followed by user pushback, and operational debugging knowledge.

## Outcome Logging

- [x] **RA-CE-012**: After completing the review, the reviewer shall log a structured review-complete event to observations.jsonl, including topics found and actions taken. This creates an audit trail for detecting systematic capture gaps.

## Related Documents

- [Review Agent LLD](./LLD.md)
