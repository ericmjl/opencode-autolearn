# Observations Logging - EARS

**Parent LLD**: ./LLD.md

## Appending Observations

- [x] **KS-OBS-001**: The system shall append each observation as a single JSON line to `~/.autolearn/observations.jsonl`.
- [x] **KS-OBS-002**: Each observation record shall include a `timestamp` field (ISO 8601) and a `project` field (directory basename).
- [x] **KS-OBS-003**: Each observation record shall include a `type` field indicating the event category.

## File Maintenance

- [x] **KS-OBS-004**: If the observations file exceeds 1000 lines, the system shall trim it to the most recent 1000 lines by removing the oldest entries.
- [x] **KS-OBS-005**: If the observations file does not exist, the system shall create it on first write.

## Error Handling

- [x] **KS-OBS-006**: If writing to the observations file fails, the system shall silently continue without crashing the plugin.

## Related Documents

- [Knowledge Store LLD](./LLD.md)
