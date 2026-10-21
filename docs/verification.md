# 验证说明

当前版本为 `1.0.0-hotfix1`。开发和核心检查命令统一维护在 [README](../README.md)；本文件说明这些检查能证明什么，以及哪些验收需要额外环境。

## 核心检查

| 检查 | 输入 | 覆盖与限制 |
|---|---|---|
| `npm run check` | 公开源码和锁定依赖 | TypeScript 与 UI/通信分层；不证明实际设备布局 |
| `npm test` | 随源码提供的合成数据 | 登录期限、刷新竞争、请求取消、SSE、幂等、只读恢复、输出及课标语义；不调用供应商 |
| `npm run check:contract` | 客户端基线与来源 SHA-256 | 离线检查已审查基线完整性；加 `-- --against /path/to/openapi.json` 才比较后端操作、字段、鉴权及事件兼容性 |
| `npm run build` | 公开构建资源 | 生成生产 Web 资源并检查体积；不含原生工具链和设备启动 |
| `npm run check:publication` | 白名单候选源码 | 检查公开边界、必需材料和常见秘密格式；不扫描不存在的 Git 历史 |
| `npm run check:notices` | 锁定生产 NPM 依赖及许可原文 | 验证随产物携带的全文与版权记录，不等同于原生 Cargo 许可清单 |

这些检查不需要生产 `.env`、账号、签名库、运行数据库、课标数据、模型或 `test-results/`。输出目录和私有归档不作为输入，测试使用虚构的令牌、用户与教学内容。

[前端工作流](../.github/workflows/frontend.yml) 执行核心检查，并在 Linux 上导出源码后独立复验；通过状态见对应 Actions 运行。

## 公开 HTTP 夹具与浏览器回归

`tests/fixtures/api.json` 使用合成账号、会话、事件和课标内容；`tests/fixture_server.py` 仅依赖 Python 标准库，提供真正分块的 HTTP/SSE。它不读取后端环境、历史报告或真实课程资料。可单独运行夹具自检：

```sh
python -m unittest discover -s tests -p '*_test.py' -v
```

手机浏览器回归为可选开发检查，需要 Python 与 Playwright；Chromium 仅作为测试浏览器安装，不进入应用：

```sh
python -m pip install -r tests/requirements-browser.txt
python -m playwright install chromium
npm run build
npm run test:browser
```

Linux 首次安装浏览器系统库可使用 `python -m playwright install --with-deps chromium`。测试使用随机本机端口直接服务 `dist/`，无需启动 Vite，并拒绝外部网络请求。可通过 `SYNAXIS_QA_PYTHON` 指定已安装 Playwright 的 Python，通过 `SYNAXIS_QA_BROWSER` 指定自备 Chromium；默认使用当前 Python 与 Playwright 管理的浏览器。

设置 `SYNAXIS_QA_LEGACY_ABORT=1` 后再运行浏览器回归，会在页面启动前移除 `AbortSignal.any`、`AbortSignal.timeout` 和 `throwIfAborted`，验证 HTTP、流式输出、取消和恢复仍可用。这是能力缺失模拟，不代表已在旧 macOS 或 Android WebView 实机验收。

前端导出器只允许列出的代码文本与资源位置/格式；数据库及 WAL/SHM/journal 文件、未知二进制、伪装文本、无效资源头和符号链接均阻止导出。允许资源的字节也接受凭据格式扫描。新增资源类型需要修改白名单并复核其来源。

## 运行时与平台验收

浏览器、系统 WebView、Android 与真实服务分别需要各自的测试环境。合成接口验证提交及展示协议，不能代替真实模型质量、实际计费或后台部署验收。真实教学与绘图可能产生费用，不能作为默认回归隐式执行。

| 范围 | 验收内容 |
|---|---|
| 浏览器/触屏 | 窄屏、深浅色、键盘、筛选、返回、长页、字体回退与减少动态效果 |
| 流式教学 | 真正分块接收、正文/思考去重、缺口恢复、正式替换、后台恢复和断线不重复提交 |
| 展示安全 | Markdown/SVG 清洗、HTML 沙箱、公式、授权图片及文件生命周期 |
| Android | Debug 无私钥构建、Release 验签、覆盖升级、Keystore、系统返回、前后台与设备安全区 |
| 桌面 | 目标系统构建、系统 WebView、凭据、托盘、窗口关闭及安装流程 |

原生安装、系统集成和发行签名须对最终目标产物另行验收。

## 性能边界

安装包上限为 100 MB，Web 资源门槛由 `scripts/check-size.mjs` 维护；平台体积以实际生成文件为准。首屏测量不包含系统 WebView 创建、后端登录、网络或模型响应。
