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

## Related Documents

- [Knowledge Store LLD](./LLD.md)
