# Synaxis 客户端

源码仓库：[STMfan/Synaxis-frontend](https://github.com/STMfan/Synaxis-frontend)。服务端独立维护于 [STMfan/Synaxis-backend](https://github.com/STMfan/Synaxis-backend)。

**1.0.0-hotfix1**，面向 Android、Windows、macOS 与 Linux 的教学客户端。使用 Preact、TypeScript 和 Tauri 2，调用系统 WebView；应用不附带 Chromium、Electron、Node 运行时、后端服务或课标模型。

## 开发

需要 Node.js 22.18 或更高版本及 npm。以下命令从仓库根目录开始，不需要生产账号、签名密钥、课标库或历史验收报告：

```sh
npm ci
npm run check
npm test
npm run check:contract
npm run build
npm run check:publication
npm run dev
```

开发预览默认监听 `http://127.0.0.1:5173`。登录和真实业务需要另行启动后端并由管理员创建账号；纯前端检查与生产 Web 构建不需要后端进程。测试层级、公开夹具和可选平台验收见 [验证说明](docs/verification.md)。

## 连接与登录

未配置时连接本机开发服务 `http://127.0.0.1:5667`。可复制 `.env.example` 为 `.env.local` 后设置 `VITE_API_BASE_URL`，或在「我的 → 服务连接」保存服务根地址。构建环境变量是新安装的默认值，已保存的用户设置优先。远程正式服务应使用 HTTPS；浏览器预览的来源须在后端 CORS 配置中获准。

账号由管理员提供，没有公开注册入口。自动登录从首次登录起固定 28 天到期，刷新不会延长期限；关闭自动登录后仅在当前进程中保留登录。密码和 access JWT 不持久化。原生端使用系统凭据存储，浏览器预览使用同源 localStorage 保存刷新凭据。退出、忘记登录、修改密码、到期或切换服务器会清除保存的登录。

## 功能

- 提问、题图、追问和答题；每次提交单独确认付费绘图授权。
- 会话搜索、筛选、分页、重命名、置顶、归档和确认删除。
- 正文与思考独立流式展示、断线续传、后台恢复、显式停止；恢复连接不重发教学请求。
- Markdown、公式、静态 SVG、受限 HTML、分支、问题和授权附件；图片默认展开并支持放大查看。
- 学习偏好、费用账本、预算、服务状态、专家信息及课程标准检索与章节溯源。
- 手机竖屏布局、系统主题、减少动态效果、来源页返回及桌面托盘。

课标本地工具独立维护于 [Synaxis-Syllabus2017](https://github.com/STMfan/Synaxis-Syllabus2017)，其提取代码、第三方模型与课程原文分别适用各自许可。课标检索依赖服务端已配置的索引和模型；客户端不携带课程资料。2017 年版课程标准不等同于独立高考考纲。旧服务或未就绪能力会显示对应提示。

## 原生构建

安装 Rust 1.90 或更高版本以及目标系统所需的 [Tauri 前置工具](https://v2.tauri.app/start/prerequisites/)，然后在对应宿主系统运行：

| 目标 | 命令 | 产物 |
|---|---|---|
| Windows | `npm run build:win` | NSIS 安装包 |
| macOS | `npm run build:mac` | `.app`、`.dmg` |
| Linux | `npm run build:linux` | `.deb` |
| Android | `npm run build:android` | 按参数选择的 APK |

桌面产物位于 `src-tauri/target/release/bundle/`。Android 的 Debug、Release 签名、SDK 与输出路径见 [Android 构建说明](docs/android.md)。开发原生窗口使用 `npm run dev:desktop`。

Windows 使用已安装的 WebView2 Runtime；macOS 使用 WKWebView；Linux 使用系统 WebKitGTK，托盘可见性取决于桌面环境。构建脚本按 100 MB 安装包上限检查，最终体积必须在目标平台实际构建后确认。发行签名、公证、实体 Android 设备及 macOS/Linux 原生行为需要各自验收，源码与 CI 配置不代表这些验收已经完成。

## 架构与契约

| 位置 | 职责 |
|---|---|
| `src/main.ts` | 装配通信层与 UI |
| `src/webview/types.ts` | 跨层共享类型与 `ClientBridge` 接口 |
| `src/webview/` | HTTP、鉴权、SSE、原生 IPC 与文件操作 |
| `src/ui/` | 页面、触屏组件、状态与样式 |
| `src-tauri/` | 原生窗口、托盘、系统凭据及 Android 工程 |
| `assets/branding/` | 构建需要的原始 Logo |
| `scripts/`、`tests/` | 构建、公开源码检查与可复现回归 |
| `contracts/openapi.json` | 当前客户端消费者契约基线 |

UI 仅从 `webview/types.ts` 导入类型，通过注入的桥接接口调用服务；UI 不直接 `fetch` 或导入 Tauri 实现。`npm run check` 同时检查类型与分层约束。

`contracts/openapi.json` 是已审查的服务契约，来源修订与 SHA-256 记录在 `contracts/source.json`。`npm run check:contract` 离线核对基线完整性；用 `npm run check:contract -- --against /path/to/openapi.json` 核对其它后端版本。字段约束、鉴权和 SSE 定义也参与检查；该检查不能替代业务语义及目标设备验收。接口入口和流式安全边界见 [API 对应说明](docs/api-coverage.md)，服务语义以 [后端前端契约](https://github.com/STMfan/Synaxis-backend/blob/main/docs/frontend-contract.md) 为准。

## 公开源码与授权

构建时生成 `public/licenses/Third-Party-NPM.txt` 与 JSON 索引，携带锁定生产 NPM 依赖的版权、完整许可和 NOTICE。`npm run check:notices` 验证它们是否仍匹配安装的依赖；该检查也属于生产构建。三个发布包缺少全文的已知依赖采用代码中精确版本限定的 Apache 许可补充，并保留上游版权来源；依赖升级后需要重新复核，不在构建中联网抓取条款。

公开前运行 `npm run check:publication`，再从白名单导出源码：

```sh
node scripts/publication.mjs --output releases/source-v1.0.0-hotfix1
```

导出目录本身就是独立前端项目根目录，直接包含 `package.json`、`src/`、`src-tauri/`、`contracts/` 和 `.github/`。发布使用导出结果；运行数据库、账号、签名、缓存、安装包、历史验收和私有归档不属于源码输入。导出检查可发现当前候选文件中的常见秘密格式，无法证明缺失的 Git 历史从未泄漏。

前端自行编写的代码采用 [MIT](LICENSE)。字体、Logo 与第三方组件的授权边界见 [NOTICE](NOTICE)、[字体与图标说明](docs/typography.md) 和 `public/licenses/`。正文默认使用系统字体，OPPO 与钉钉字体仅调用用户本机已安装的版本，不随源码或安装包分发。安全存储插件的本地改动见 [插件补丁说明](src-tauri/plugins/secure-keystore/SYNAXIS-PATCH.md)。历史功能变化统一记录在 [CHANGELOG](CHANGELOG.md)。
