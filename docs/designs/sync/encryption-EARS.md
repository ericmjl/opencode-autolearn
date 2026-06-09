# Sync Encryption - EARS

**Parent LLD**: ./encryption-LLD.md

## Key Derivation

- [ ] **SYNC-ENC-001**: When `sync login` is invoked, the system shall derive a 256-bit master key from the user's password using PBKDF2-SHA256 with 600,000 iterations and a per-installation random salt.
- [ ] **SYNC-ENC-002**: The derived master key shall be stored in the OS keychain under service name `autolearn-sync` and never written to a file.
- [ ] **SYNC-ENC-003**: If the OS keychain is unavailable, the system shall prompt for the password on every sync operation as a fallback.
- [ ] **SYNC-ENC-004**: The per-installation salt (`.encryption_salt`) shall be a 32-byte random value generated on first `sync login` and synced alongside encrypted data.

## Key Hierarchy

- [ ] **SYNC-ENC-005**: Persona keys shall be derived as `HMAC-SHA256(master_key, persona_id)`.
- [ ] **SYNC-ENC-006**: File keys shall be derived as `HMAC-SHA256(persona_key, file_path)`.
- [ ] **SYNC-ENC-007**: Each file shall be encrypted with its own file key, providing per-file isolation.

## Encryption

- [ ] **SYNC-ENC-008**: All file contents shall be encrypted using AES-256-GCM with a random 12-byte nonce per encryption operation.
- [ ] **SYNC-ENC-009**: The system shall store the GCM authentication tag alongside ciphertext and verify it on decryption to detect tampering.
- [ ] **SYNC-ENC-010**: If GCM tag verification fails during decryption, the system shall report a tampering error and skip that file without aborting the entire sync.

## Key Management

- [ ] **SYNC-ENC-011**: `sync logout` shall remove the master key from the OS keychain but shall not delete local data.
- [ ] **SYNC-ENC-012**: `sync export-key` shall print the master key in base58 encoding for offline backup.
- [ ] **SYNC-ENC-013**: `sync rotate-key` shall re-encrypt all stored blobs with a new key derived from a new password, then push the re-encrypted blobs to the server.
- [ ] **SYNC-ENC-014**: If the master password is lost and no backup key exists, the data shall be irrecoverable.

## Related Documents

- [Encryption LLD](./encryption-LLD.md)
- [Sync Protocol LLD](./protocol-LLD.md)
