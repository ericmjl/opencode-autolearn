# Memory Management - EARS

**Parent LLD**: ./LLD.md

## Initialization

- [x] **KS-MEM-001**: When any command is invoked, the system shall ensure the `~/.autolearn/` directory tree exists (creating it if necessary).
- [x] **KS-MEM-002**: The `init` command shall create default `memory.md`, `user-profile.md`, and `config.yaml` files if they do not exist.

## Adding Entries

- [x] **KS-MEM-003**: When `memory add <content>` is invoked, the system shall append the content as a new entry to memory.md.
- [x] **KS-MEM-004**: When `user add <content>` is invoked, the system shall append the content as a new entry to user-profile.md.
- [x] **KS-MEM-005**: The system shall deduplicate entries by case-insensitive exact match, keeping only the first occurrence.
- [x] **KS-MEM-006**: If the total character count of memory entries exceeds 3000, the system shall remove entries from the front (oldest first) until under the limit.
- [x] **KS-MEM-007**: If the total character count of user profile entries exceeds 2000, the system shall remove entries from the front until under the limit.
- [x] **KS-MEM-008**: The system shall always retain at least one entry even if it exceeds the character limit.

## Removing Entries

- [x] **KS-MEM-009**: When `memory remove <keyword>` is invoked, the system shall remove all entries containing the keyword (case-insensitive match).
- [x] **KS-MEM-010**: When `user remove <keyword>` is invoked, the system shall remove all entries containing the keyword.
- [x] **KS-MEM-011**: The remove commands shall report the number of entries removed and remaining.

## Listing Entries

- [x] **KS-MEM-012**: When `memory list` is invoked, the system shall print a numbered list of all memory entries.
- [x] **KS-MEM-013**: When `user list` is invoked, the system shall print a numbered list of all user profile entries.
- [x] **KS-MEM-014**: The `memory list` command shall report total entry count and total character count.

## Markdown Parsing

- [x] **KS-MEM-015**: The system shall skip HTML comments when parsing markdown entries.
- [x] **KS-MEM-016**: The system shall skip heading lines (lines starting with `#`) when parsing entries.
- [x] **KS-MEM-017**: The system shall strip `- ` and `* ` list prefixes from entries.

## File Writing

- [x] **KS-MEM-018**: The system shall write memory.md with a `# Autolearn Memory` heading, managed-by comment, and bullet-list entries.
- [x] **KS-MEM-019**: The system shall write user-profile.md with a `# User Profile` heading, managed-by comment, and bullet-list entries.

## Environment Override

- [x] **KS-MEM-020**: The system shall use the `AUTOLEARN_HOME` environment variable as the data directory if set, defaulting to `~/.autolearn/`.

## Reinforcement (Agent-Driven Semantic Dedup)

- [x] **KS-MEM-021**: The `memory strengths` command shall print all tracked entries sorted by strength (highest first), showing count, first_seen, last_seen, and a text snippet.
- [x] **KS-MEM-022**: The reviewer agent shall check existing memories via `memory list` before adding new entries, and use `memory strengthen <keyword>` when a new observation is semantically the same as an existing entry.
- [x] **KS-MEM-023**: When `memory strengthen <keyword>` is invoked and exactly one entry matches, the system shall increment the strength counter for that entry in `strengths.json`.
- [x] **KS-MEM-024**: When `memory weaken <keyword>` is invoked and exactly one entry matches, the system shall decrement the strength counter, removing the record if count drops to 0.
- [x] **KS-MEM-025**: When `memory remove` removes entries, the system shall also remove the corresponding strength records from `strengths.json`.
- [x] **KS-MEM-026**: The curator shall report entries with strength >= `escalation_threshold` (default 3) as escalation candidates, suitable for promotion to AGENTS.md.

## Related Documents

- [Knowledge Store LLD](./LLD.md)
