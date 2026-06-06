# Skill CRUD - EARS

**Parent LLD**: ./LLD.md

## Skill Creation

- [x] **SM-SC-001**: When `skill create <name> <description>` is invoked, the system shall create a slugified directory name (lowercase, non-alphanumeric replaced with `-`, max 60 chars).
- [x] **SM-SC-002**: If a skill with the same slug already exists, the system shall exit with error code 1.
- [x] **SM-SC-003**: The system shall create a SKILL.md file with YAML frontmatter containing name, description, created_by ("autolearn"), and created_at date.
- [x] **SM-SC-004**: The system shall register the new skill in `.usage.json` with state "active", use_count 0, and patch_count 0.
- [ ] **SM-SC-005**: The system shall create a symlink from `~/.agents/skills/{slug}` pointing to `~/.autolearn/skills/{slug}` so that OpenCode auto-discovers the skill.

## Skill Patching

- [x] **SM-SP-001**: When `skill patch <name> <section> <content>` is invoked, the system shall locate the skill's SKILL.md file.
- [x] **SM-SP-002**: If the named skill does not exist, the system shall exit with error code 1.
- [x] **SM-SP-003**: If the section header `## {section}` already exists in SKILL.md, the system shall append `- {content}` before the next `##` heading.
- [x] **SM-SP-004**: If the section header does not exist, the system shall append a new `## {section}` heading with `- {content}` at the end of the file.
- [x] **SM-SP-005**: The system shall increment the patch_count and update last_activity_at in `.usage.json`.

## Skill Archival

- [x] **SM-SA-001**: When `skill archive <name>` is invoked, the system shall move the skill directory from `skills/` to `skills/.archive/`.
- [x] **SM-SA-002**: If the skill directory does not exist, the system shall exit with error code 1.
- [x] **SM-SA-003**: If the skill is already in `.archive/`, the system shall exit with error code 1.
- [x] **SM-SA-004**: The system shall update the skill's state to "archived" with the current date as archived_at in `.usage.json`.
- [ ] **SM-SA-005**: The system shall remove the symlink from `~/.agents/skills/{slug}` when archiving a skill.

## Skill Listing

- [x] **SM-SL-001**: When `skill list` is invoked, the system shall print all skills sorted by name with their state, use count, patch count, and last activity date.
- [x] **SM-SL-002**: If no skills exist, the system shall print "No skills created yet."

## Skill Usage

- [x] **SM-SU-001**: When `skill usage` is invoked, the system shall print the full `.usage.json` content as formatted JSON.
- [x] **SM-SU-002**: If no usage data exists, the system shall print "No usage data."

## Related Documents

- [Skill Management LLD](./LLD.md)
