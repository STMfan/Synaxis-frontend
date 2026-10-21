Vendored from tauri-plugin-secure-keystore 0.0.2 (MIT OR Apache-2.0).
Upstream: https://github.com/Abdullah-5603/tauri-plugin-secure-keystore
Copyright (c) 2026 Abdullah; both upstream license texts are retained.

Android persistence patch

Encrypted SharedPreferences writes/deletes use synchronous commit(), check
success, and reject failed writes before returning to Rust. A rotated one-time
refresh token is persisted before the caller proceeds. No plaintext fallback.
Android AES-GCM keys remain in Android Keystore; desktop storage uses keyring.

Vendored source boundary

Synaxis uses the Rust path dependency and invokes its registered commands
from the application bridge. The unused standalone npm/JSR publishing chain,
guest-js wrapper, upstream changelog, duplicate Cargo manifest and independent
plugin lockfiles have been omitted. The application package-lock.json and
src-tauri/Cargo.lock define the installed dependency sets. The local README
now documents this integration rather than upstream package installation.
Rust, Android, iOS, build.rs, permissions and both licenses are retained.
