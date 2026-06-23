# Multi-Persona - EARS

**Parent LLD**: ./persona-LLD.md

## Persona Management

- [x] **SYNC-PER-001**: `persona create <name> "<description>"` shall generate a UUID v4, create the directory `~/.autolearn/personas/<name>/` with defaults, and register the persona in `.persona_registry.json`.
- [x] **SYNC-PER-002**: `persona list` shall display all personas with their UUIDs, descriptions, sync status, and creation dates.
- [x] **SYNC-PER-003**: `persona switch <name>` shall set the given persona as the machine-wide default.
- [x] **SYNC-PER-004**: `persona archive <name>` shall mark the persona as archived (read-only, sync disabled) without deleting files.
- [x] **SYNC-PER-005**: `persona rename <old> <new>` shall rename the persona directory and update the registry.

## Backward Compatibility

- [x] **SYNC-PER-006**: When no `--persona` flag is given, all commands shall operate on the `default` persona.
- [x] **SYNC-PER-007**: The `default` persona shall be created automatically on `init` and shall use the existing `~/.autolearn/` structure if no persona directories exist yet.

## Per-Persona Isolation

- [x] **SYNC-PER-008**: Each persona shall have its own complete set of files (memory.md, user-profile.md, strengths.json, config.yaml, observations.jsonl, skills/, etc.).
- [x] **SYNC-PER-009**: Commands with `--persona work` shall read/write only from `~/.autolearn/personas/work/`.
- [x] **SYNC-PER-010**: Persona encryption keys shall be independently derived via HMAC chain, so compromising one persona's ciphertext does not expose others.

## Per-Persona Sync

- [x] **SYNC-PER-011**: `sync push --persona work` shall push only the specified persona's encrypted files.
- [ ] **SYNC-PER-012**: `sync push` (no persona flag) shall push all personas with `sync_enabled: true`. _(partial — currently pushes the active/machine-default persona only; multi-persona iteration deferred)_
- [ ] **SYNC-PER-013**: Personas with `sync_enabled: false` shall never be pushed to the sync server. _(enforced when SYNC-PER-012 ships)_

## Project-Level Persona

- [ ] **SYNC-PER-014**: The plugin shall check for a `.autolearn-persona` file in the project root to determine the active persona for that project. _(deferred)_
- [x] **SYNC-PER-015**: If no `.autolearn-persona` file exists, the plugin shall fall back to the machine-wide default set by `persona switch`.
- [x] **SYNC-PER-016**: If the machine-wide default is not set, the plugin shall use `default`.

## OpenCode Integration

- [ ] **SYNC-PER-017**: The `instructions` field in `opencode.json` shall include memory.md from all active personas for the current project. _(deferred — plugin currently loads `personas/default/memory.md` only)_
- [ ] **SYNC-PER-018**: When a project switches persona (`.autolearn-persona` changes), the plugin shall reload the appropriate memory.md. _(deferred — depends on SYNC-PER-014)_

## Related Documents

- [Multi-Persona LLD](./persona-LLD.md)
- [Encryption LLD](./encryption-LLD.md)
