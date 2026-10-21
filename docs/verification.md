# 开发与验证

本页集中列出客户端功能回归、接口检查、浏览器测试和源码导出的入口。项目介绍、界面和启动方式见 [README](../README.md)。

## 核心检查

安装依赖后，在仓库根目录运行：

```sh
npm run check
npm test
npm run check:contract
npm run build
npm run check:publication
```

| 命令 | 覆盖的功能 |
|---|---|
| `npm run check` | TypeScript、界面与通信层的类型和引用关系 |
| `npm test` | 登录与刷新、请求取消、SSE、幂等提交、后台恢复、讲解与课标展示 |
| `npm run check:contract` | 已审查 API 基线与来源 SHA-256；使用 `-- --against /path/to/openapi.json` 比较其他后端版本 |
| `npm run build` | 生产 Web 页面、品牌图标、资源体积和依赖许可 |
| `npm run check:publication` | 公开源码、README 截图、必需资源及常见秘密格式 |
| `npm run check:notices` | 锁定生产 NPM 依赖的版权、许可全文与 NOTICE |

普通回归使用合成账号、教学内容和临时状态，不调用真实模型。类型、测试和生产构建均可独立于后端进程执行。[前端工作流](../.github/workflows/frontend.yml) 在 Windows/Linux 运行这些检查，Linux 还会从导出源码重新安装并验证。

## HTTP 与流式夹具

`tests/fixtures/api.json` 提供合成账号、会话、事件和课标内容；`tests/fixture_server.py` 提供真正分块的 HTTP/SSE，用于验证消息分页、鉴权、历史回补和终态恢复。

```sh
python -m unittest discover -s tests -p '*_test.py' -v
```

## 浏览器回归

浏览器回归直接服务生产 `dist/`，检查触屏界面、登录、流式讲解和恢复流程。运行前准备 Python、Playwright 与 Chromium：

```sh
python -m pip install -r tests/requirements-browser.txt
python -m playwright install chromium
npm run build
npm run test:browser
```

Linux 可使用 `python -m playwright install --with-deps chromium` 安装浏览器系统库。`SYNAXIS_QA_PYTHON` 可指定已安装 Playwright 的 Python，`SYNAXIS_QA_BROWSER` 可指定自备 Chromium；测试使用随机本机端口并阻断外部网络请求。

设置 `SYNAXIS_QA_LEGACY_ABORT=1` 后运行浏览器回归，可模拟缺少 `AbortSignal.any`、`AbortSignal.timeout` 和 `throwIfAborted` 的 WebView，覆盖超时、取消及恢复行为。

## 源码导出

```sh
npm run check:publication
npm run export:source
```

导出目录直接包含 `package.json`、`src/`、`src-tauri/`、文档和 CI。`docs/images/` 的 PNG 用于 README 展示；公开源码不含运行数据库、私有账号、签名、安装依赖或历史测试报告。

导出器检查允许的资源位置与格式，扫描文本和二进制资源中的凭据格式，并拒绝数据库、未知二进制和符号链接。这项检查针对当前候选文件，Git 历史需要单独检查。

## 原生平台检查

| 范围 | 检查的使用场景 |
|---|---|
| 窄屏与触屏 | 深浅色、键盘、返回、长页、图片放大及减少动态效果 |
| 流式教学 | 分块接收、正文与思考展示、断线续传、后台恢复和停止 |
| Android | Debug/Release 构建、覆盖升级、Keystore、系统返回及安全区 |
| 桌面 | 系统 WebView、凭据存储、托盘、窗口关闭与安装流程 |

Android 的工具链、构建和签名命令见 [android.md](android.md)。浏览器回归与原生安装、设备运行分别验证；平台体积以实际安装包为准，构建脚本的包体上限为 100 MB。
