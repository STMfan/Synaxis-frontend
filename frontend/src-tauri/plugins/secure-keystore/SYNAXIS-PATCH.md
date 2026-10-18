Vendored from tauri-plugin-secure-keystore 0.0.2 (MIT OR Apache-2.0).
Upstream: https://github.com/Abdullah-5603/tauri-plugin-secure-keystore

Synaxis patch: Android encrypted SharedPreferences writes/deletes use synchronous
commit(), check success, and reject failed writes before returning to Rust. This
ensures a rotated one-time refresh token is persisted before the caller proceeds.
No plaintext fallback. Android AES-GCM key stays in Android Keystore. Desktop
uses the operating system credential store through keyring.
