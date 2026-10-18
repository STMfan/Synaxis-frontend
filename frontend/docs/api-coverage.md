# 客户端 API 对应与协议边界

当前客户端消费者基线为 [contracts/openapi.json](../contracts/openapi.json)，服务端生成契约为 `backend/contracts/openapi.json`。更新后端时先重新生成服务契约，再运行 `npm run check:contract` 并审查差异；不能仅凭版本号或路径数量判断兼容。完整字段与服务语义见 [后端前端契约](../../backend/docs/frontend-contract.md)。

## 业务入口

所有请求均由 `ClientBridge` 经过通信层执行，UI 没有独立网络通道。下表用于查找业务入口，机器可读 OpenAPI 是操作与字段的维护来源。

| 接口组 | 桥接方法 | UI 与用途 |
|---|---|---|
| 健康、能力、错误码 | `health`、`capabilities`、`errors` | 启动、连接检测、功能状态及恢复提示 |
| 登录、刷新、退出 | `login`、通信层刷新、`logout` | 登录与固定期限自动登录；刷新串行执行 |
| 账号、密码与偏好 | `profile`、`changePassword`、`preferences`、`setPreferences` | 我的、账号安全、学习偏好 |
| 专家目录 | `experts` | 关于与专家介绍 |
| 会话目录及详情 | `sessions`、`session` | 最近会话、目录筛选/分页、详情与恢复 |
| 新会话、追问、答题 | `create`、`send`、`answer` | 提问及教学输入；每次逻辑提交携带幂等键 |
| 会话管理 | `patch`、`remove`、`cancel` | 重命名/置顶/归档、确认软删除、显式停止 |
| 消息与事件 | `messages`、`stream`、`eventHistory` | 公开消息分页、Bearer SSE 与历史回补 |
| 题图与产物 | `image`、`artifact` | 带鉴权读取二进制内容、预览与保存 |
| 预算与账本 | `budget`、`usage`、`usageSummary` | 本题预算、费用记录及汇总 |
| 课程标准 | `searchSyllabus`、`syllabusSection` | 我的 → 课程标准，检索命中 → 章节原文与来源 |

登录使用表单编码，其余业务写请求使用 JSON。管理员操作、数据导入、供应商配置与独立沙箱不属于学生客户端接口。开发文档资源不伪装为业务功能。

## 鉴权与可靠提交

JWT 只放在请求头。更换服务器时清除旧凭据，原生与浏览器请求均不跟随 HTTP 重定向。自动登录的 28 天期限由首次登录固定，刷新不滑动延长。

新会话、追问与答题分别维护逻辑提交的幂等键。未知结果后，用户显式重试相同内容时复用原键；编辑内容产生新键。恢复连接仅重新读取和订阅，不能自动重发收费教学请求。

## 流式输出与恢复

公开消息 ID、持久化事件 ID 和每个 `stream_id` 的 `sequence` 分别维护。正文 `output_*` 与思考 `reasoning_*` 使用独立序列；重复分片不追加，缺口在推进游标前触发同步。`output_end:received` 只代表上游接收完成，正式 Presentation 到达后替换预览；中断预览不标为完成答案。

临时正文只作受限 Markdown 暂排，原始 HTML 不执行，未完成的 JSON、SVG、HTML 或 TeX 不作为正式产物解释。完整公式经过受限 MathJax；正式 Markdown/SVG 再清洗，HTML 使用无脚本、无网络、无同源访问的沙箱。`reasoning_*` 仅显示服务实际返回的文本。

隐藏时释放订阅，回前台时合并会话、消息、预算与事件历史同步，只为运行中的轮次重开 SSE。正常空尾流不视为教学失败；没有持久化 ID 的鉴权信号和已有 ID 的教学失败分别处理。流与界面状态同时恢复，不能单独保存裸游标后跳过正文。

`warning.fallback=markdown` 表示存在降级叶块，继续保留合法 blocks 与原位产物；历史代码围栏作为文本，不能解包执行。

## 费用与课程范围

预算和账本使用服务端十进制金额与实际费率快照，未知费用保持未知，USD/CNY 分开。供应商代金券排除计费不等于供应商免费。额度及最大上下文由后端预算规则裁减，客户端不保证输出长度。

课标接口使用学生 JWT，不创建教学或调用云端 embedding。客户端保留原文、分类、范围、来源 SHA-256 与质量提示，区分 PDF 页序和印刷页码。排序不是置信度，没有命中不代表不考；原始 PDF 不由章节 ID 伪造下载链接。数据或向量模型未就绪时保留明确状态和可用的降级方式。
