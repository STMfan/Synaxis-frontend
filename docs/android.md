# Android 构建

Android 客户端使用系统 WebView 与 Tauri Rust，最低 Android 7.0 / API 24，不携带浏览器内核。默认构建 ARM64，另支持 x86_64 模拟器或设备。

## 工具链

需要 Node.js、Rust、JDK 21 或更新版本，以及 Android SDK（API 37、platform-tools、build-tools）和 NDK。当前工程固定 Gradle 9.6.1、Android Gradle Plugin 9.3.1；Gradle Wrapper 会下载匹配版本。Android 工程已经包含在源码中，无需再次执行 `android init`。

构建脚本按以下顺序寻找工具，不绑定个人机器路径：

- JDK：`JAVA_HOME`，否则使用 `PATH` 中的 JDK `java`，同时检查 `javac`。
- SDK：`ANDROID_HOME`、`ANDROID_SDK_ROOT`、`PATH` 中 `adb` 所属 SDK，最后查找 Android Studio 的标准安装目录。
- NDK：`NDK_HOME`、`ANDROID_NDK_HOME`，否则使用 SDK `ndk` 目录下版本号最高的安装。
- Gradle 缓存：保留 `GRADLE_USER_HOME`；未配置时使用工程 `.cache/gradle`。

工具不在标准位置时，请配置这些环境变量。不要提交 `local.properties`、生成的 Cargo/Gradle 路径或密钥配置。

```sh
npm ci
rustup target add aarch64-linux-android x86_64-linux-android
npm run build:android -- --debug
npm run build:android -- x86_64 --debug
```

Debug 构建使用 Android 标准开发签名，无需 `keystore.properties` 或发布者私钥。开发签名与正式签名不同，因此不能覆盖已安装的正式签名版本；使用独立测试设备或先卸载原应用（卸载会清除本地凭据与设置）。

输出位于 `releases/android/`，Debug 文件名带 `_debug` 后缀。构建日志、签名验证结果、体积与 SHA256 记录在被忽略的 `test-results/`，不作为源码测试的输入。

## 正式签名

```sh
npm run build:android
npm run build:android -- x86_64
```

默认构建 Release。需要自行创建或安全恢复发布密钥，并在 `src-tauri/gen/android/keystore.properties` 配置：

```properties
storeFile=/absolute/path/to/release.jks
keyAlias=release
storePassword=<your-store-password>
keyPassword=<your-key-password>
```

Windows 路径使用正斜杠。`storeFile` 也支持相对于 Android 工程根目录的路径。为兼容已有配置，共用密码时可用单个 `password` 代替 `storePassword` 和 `keyPassword`。配置、密钥和密码文件均须保留在忽略目录或工程外，并自行安全备份。

Gradle 配置与 Debug 不要求发布密钥；只有执行 Release 任务才校验其是否完整。正式更新必须复用同一签名密钥，并增加 `src-tauri/gen/android/app/release.properties` 的 `versionCode`；`versionName` 由 Tauri 从应用版本生成。热修订和预发布版本也必须使用递增的独立 `versionCode`。

脚本对输出 APK 执行 `apksigner verify`，检查 100 MB 体积上限，再复制到 `releases/android/` 并生成 SHA256。正式签名流程可参考 [Tauri Android 签名文档](https://v2.tauri.app/distribute/sign/android/)。

Windows 缺少符号链接权限时，仅对 Tauri 明确的符号链接权限错误启用兼容装配：必须同时证明当前调用的 Cargo 已成功完成目标 profile，才复制该 ABI 的库并通过 Gradle 组装。编译失败、缺少库或其他错误均直接停止，不会用旧 APK 报告成功。

## 运行与维护

后端地址在客户端设置页修改。Android 清单允许 HTTP 以支持本地开发；远程部署应配置 HTTPS。应用关闭系统备份，刷新凭据经 Android Keystore 内的 AES-GCM 密钥加密，不保存账号密码。

`MainActivity.kt` 使用 `OnBackPressedDispatcher`，经通信契约处理键盘、弹层、详情来源页和主屏再次返回退出。保留自定义 Activity；不要编辑 Tauri 自动生成的 `TauriActivity` / `WryActivity`。输入框与导航岛位于页面转场容器之外，避让键盘和系统手势安全区。

生成的 `tauri.settings.gradle`、`app/tauri.properties`、`app/tauri.build.gradle.kts`、`app/proguard-tauri.pro`、`app/src/main/**/generated`、`app/src/main/assets/tauri.conf.json` 及 `jniLibs` 原生库不进入源码公开包。Tauri CLI 会根据当前机器重新生成；无需复制另一台机器的 Cargo 路径。图标由项目品牌素材自动生成，字体来源与分发策略见 [typography.md](typography.md)。

浏览器、模拟器和实体手机验证应分别记录。Debug 构建通过或模拟器运行通过，均不代表所有 Android 厂商 ROM 和实体机已验收。
