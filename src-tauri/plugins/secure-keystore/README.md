# Vendored secure-keystore plugin

Source: [tauri-plugin-secure-keystore 0.0.2](https://github.com/Abdullah-5603/tauri-plugin-secure-keystore).
Copyright (c) 2026 Abdullah. The plugin retains its upstream
[MIT](LICENSE-MIT) OR [Apache-2.0](LICENSE-APACHE) license choice.

Synaxis uses this directory as a Rust path dependency from `src-tauri/Cargo.toml`.
Its TypeScript bridge calls the registered `set_item`, `get_item` and
`delete_item` commands through Tauri `invoke`; no separate JavaScript plugin
package is installed or built. The application lockfiles are authoritative.

The Rust, Android, iOS and permission sources remain together because the
plugin build script references the mobile projects. Platform credentials stay
in Android Keystore, iOS Keychain or the desktop operating system credential
store. There is no plaintext fallback.

Local code changes and the retained source boundary are documented in
[SYNAXIS-PATCH.md](SYNAXIS-PATCH.md).
