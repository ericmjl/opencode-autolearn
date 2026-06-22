# Sync Encryption - Low-Level Design

**Created**: 2026-06-08
**HLD Link**: ../../high-level-design.md (Decision 5)

## Overview

The encryption layer ensures that the sync server stores only opaque ciphertext. All encryption and decryption happen client-side in `autolearn.py`. The server never sees plaintext, even if the database operator inspects records directly.

## Context

Per the HLD, sync is optional and E2E-encrypted. The CLI handles encrypt/decrypt before any network call. The encryption scheme must work without external crypto libraries beyond Python's `cryptography` package (added via PEP 723).

## Key Derivation Chain

```
Master Password (user-entered)
      │
      ▼
  PBKDF2-SHA256 (600,000 iterations, per-installation random salt)
      │
      ▼
  master_key (256 bits) — stored in OS keychain after first derivation
      │
      ├──► persona_key = HMAC-SHA256(master_key, persona_id)
      │         │
      │         └──► file_key = HMAC-SHA256(persona_key, file_path)
      │
      └──► One key per persona, one key per file within a persona
```

### Key Storage

| OS | Backend | Package |
|----|---------|---------|
| macOS | Keychain | `keyring` |
| Linux | Secret Service / kwallet | `keyring` |
| Windows | Credential Manager | `keyring` |

The keychain stores `master_key` under service name `autolearn-sync`. Password is never stored — only the derived key.

### Salt

`.encryption_salt` in `~/.autolearn/` — 32 random bytes, generated on `sync login`. The salt must be the same on all machines to derive the same master key. **Phase 1 requires manual copying** (`scp ~/.autolearn/.encryption_salt newmachine:~/.autolearn/`). Automatic salt bootstrap is deferred — see SYNC-ENC-004.

## Encryption Scheme

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Algorithm | AES-256-GCM | Authenticated encryption, detects tampering |
| Key size | 256 bits | Standard, no key-recovery concerns |
| Nonce | 12 bytes, random per encryption | GCM requirement, no nonce reuse |
| Key derivation | PBKDF2-SHA256, 600k iterations | OWASP 2023 recommendation |
| Key hierarchy | HMAC-SHA256 chain | Per-persona and per-file isolation |

## Encryption/Decryption Flow

### Push (encrypt)

```
1. Read file from ~/.autolearn/personas/{name}/{file}
2. Derive file_key from master_key → persona_key → file_key
3. Generate random 12-byte nonce
4. Encrypt: AES-256-GCM(file_key, nonce, plaintext) → ciphertext + tag
5. Package: { key: file_name, ciphertext: base64, nonce: base64, tag: base64 }
6. Send to sync server
```

### Pull (decrypt)

```
1. Receive { key, ciphertext, nonce, tag } from sync server
2. Derive file_key (same as push)
3. Decrypt: AES-256-GCM-decrypt(file_key, nonce, ciphertext, tag) → plaintext
4. If tag verification fails: report tampering, skip file
5. Write plaintext to ~/.autolearn/personas/{name}/{file}
```

## Stored Record Format

```json
{
  "user_id": "sha256(api_key)",
  "persona_id": "uuid-v4",
  "file_key": "memory.md",
  "ciphertext": "base64 (includes GCM tag appended)",
  "nonce": "base64-12-bytes",
  "tag": "",
  "machine_id": "hostname-fingerprint",
  "updated_at": 1717852800
}
```

**Implementation note**: The `cryptography` library's `AESGCM.encrypt()` returns `ciphertext || tag` (tag is the last 16 bytes). The CLI sends `tag: ""` on the wire and embeds the real tag inside `ciphertext`. The server stores fields verbatim and is agnostic to this. File names are NOT encrypted (predictable, ~10 options). Persona names stay client-side only (server sees UUIDs).

## Key Management Commands

| Command | Description |
|---------|-------------|
| `sync login` | Derive master key from password, store in OS keychain |
| `sync logout` | Remove key from OS keychain |
| `sync export-key` | Print recovery key (base58-encoded master key) for offline backup |
| `sync rotate-key` | Re-encrypt all stored blobs with new key (password change) |

## Edge Cases

1. **Lost password + no backup key**: Data is irrecoverable. This is the privacy tradeoff.
2. **Salt file corrupted**: Cannot derive keys. Recovery: re-login with password + import salt from another machine.
3. **Keychain unavailable**: Fallback to prompting for password on every sync operation.
4. **Tampered ciphertext**: GCM auth tag verification fails → CLI reports error, skips that file, continues with others.

## Dependencies

- **`cryptography`**: AES-256-GCM, PBKDF2, HMAC (added to PEP 723 dependencies)
- **`keyring`**: OS keychain integration (added to PEP 723 dependencies)

## Related Documents

- [High-Level Design](../../high-level-design.md)
- [Sync Protocol LLD](./protocol-LLD.md)
- [Multi-Persona LLD](./persona-LLD.md)
- [Encryption EARS](./encryption-EARS.md)
