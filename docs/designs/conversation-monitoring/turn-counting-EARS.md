# Turn Counting & Buffering - EARS

**Parent LLD**: ./LLD.md

## Turn Counting

- [x] **CM-TC-001**: The system shall increment the turn counter once for each finalized assistant message.
- [x] **CM-TC-002**: When a message part delta arrives, the system shall accumulate the delta text into the message's text buffer.
- [x] **CM-TC-003**: When a message is finalized (message.updated event), the system shall determine the role and buffer the message content.
- [x] **CM-TC-004**: If the message role is "user", the system shall buffer the message content (truncated to 1000 characters) without incrementing the turn counter.
- [x] **CM-TC-005**: If the message role is "assistant", the system shall buffer the message content (truncated to 2000 characters) and increment the turn counter.
- [x] **CM-TC-006**: The system shall redact secrets (API keys, tokens, passwords) from all buffered message content before storing.

## Buffer Management

- [x] **CM-BUF-001**: The system shall maintain a buffer of recent messages for review formatting.
- [x] **CM-BUF-002**: If the buffer exceeds `max_conversation_buffer` messages (default 50), the system shall discard the oldest messages.
- [x] **CM-BUF-003**: When a review is spawned, the system shall capture the buffer contents and clear it for the next review cycle.

## Idle Detection

- [x] **CM-IDLE-001**: When a session.idle event fires and `session_review_on_idle` is true (default), the system shall consider spawning a review.
- [x] **CM-IDLE-002**: If the buffer contains fewer than 3 messages, the system shall not spawn an idle review.
- [x] **CM-IDLE-003**: If an idle review was spawned within the last `idle_cooldown_ms` milliseconds (default 300000 / 5 min), the system shall not spawn another idle review.
- [x] **CM-IDLE-004**: If a review is already in progress, the system shall not spawn an idle review.

## Memory Injection

- [x] **CM-MEM-001**: When the plugin loads, the system shall add `~/.autolearn/memory.md` to the opencode.json instructions array if not already present.

## Reviewer Guard

- [x] **CM-GUARD-001**: If the `AUTOLEARN_REVIEWER` environment variable is set to "1", the system shall not register any event hooks.
- [x] **CM-GUARD-002**: The system shall set a global symbol guard to prevent double-initialization if the plugin module is loaded twice.

## Related Documents

- [Conversation Monitoring LLD](./LLD.md)
