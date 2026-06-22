# Sync Encryption - EARS

**Parent LLD**: ./encryption-LLD.md

## Key Derivation

- [x] **SYNC-ENC-001**: When `sync login` is invoked, the system shall derive a 256-bit master key from the user's password using PBKDF2-SHA256 with 600,000 iterations and a per-installation random salt.
- [x] **SYNC-ENC-002**: The derived master key shall be stored in the OS keychain under service name `autolearn-sync` and never written to a file.
- [x] **SYNC-ENC-003**: If the OS keychain is unavailable, the system shall prompt for the password on every sync operation as a fallback.
- [ ] **SYNC-ENC-004**: The per-installation salt (`.encryption_salt`) shall be a 32-byte random value generated on first `sync login` and synced alongside encrypted data. _(partial — generation + local persistence shipped; "synced alongside encrypted data" deferred. Phase 1 requires manual salt copying to new machines via `scp ~/.autolearn/.encryption_salt newmachine:~/.autolearn/`. Phase 2+ will add automatic salt bootstrap.)_

## Key Hierarchy

- [x] **SYNC-ENC-005**: Persona keys shall be derived as `HMAC-SHA256(master_key, persona_id)`.
- [x] **SYNC-ENC-006**: File keys shall be derived as `HMAC-SHA256(persona_key, file_path)`.
- [x] **SYNC-ENC-007**: Each file shall be encrypted with its own file key, providing per-file isolation.

## Encryption

- [x] **SYNC-ENC-008**: All file contents shall be encrypted using AES-256-GCM with a random 12-byte nonce per encryption operation.
- [x] **SYNC-ENC-009**: The system shall store the GCM authentication tag alongside ciphertext and verify it on decryption to detect tampering.
- [x] **SYNC-ENC-010**: If GCM tag verification fails during decryption, the system shall report a tampering error and skip that file without aborting the entire sync.

## Key Management

- [x] **SYNC-ENC-011**: `sync logout` shall remove the master key from the OS keychain but shall not delete local data.
- [x] **SYNC-ENC-012**: `sync export-key` shall print the master key in base58 encoding for offline backup.
- [ ] **SYNC-ENC-013**: `sync rotate-key` shall re-encrypt all stored blobs with a new key derived from a new password, then push the re-encrypted blobs to the server. _(deferred — Phase 2+)_
- [x] **SYNC-ENC-014**: If the master password is lost and no backup key exists, the data shall be irrecoverable.

## Related Documents

- [Encryption LLD](./encryption-LLD.md)
- [Sync Protocol LLD](./protocol-LLD.md)
