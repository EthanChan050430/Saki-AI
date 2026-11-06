# Agent 运行中引导

## API

`POST /api/chat/stream/:chatId/steer`，JSON 字段：

- `assistantMsgId`：创建当前 `/api/chat` 运行时使用的消息 ID，字符串或整数，必填。
- `text`：引导文本，可省略；UTF-8 上限 32 KiB。
- `files`：可省略，最多 8 个已通过 `/api/upload` 上传的附件。每项包含 `path`，可带 `name` / `filename`、`content`。文本与附件不能同时为空。

成功返回 HTTP 202，响应体与 `steering/accepted` SSE 一致。400 为无效参数；413 为大小超限；429 为本运行累计引导超过 100 条；409 为运行不存在、模式不支持、ID 不匹配、初始化未就绪、正在结束或校验期间运行已更换。500 为持久化等内部错误。

仅支持携带 `chatId`、`assistantMsgId` 的后台 `agent` 运行。不支持普通 CHAT、PPT、深度阅读、可信度核查、Story Glass、已结束或等待审批的运行。等待审批须使用原有审批恢复机制。

## SSE

沿用 `data: <JSON>\n\n`，从原始聊天流或重连 `GET /api/chat/stream/:chatId` 接收：

- 引导：`{ type: "steering", status: "accepted" | "applied", chatId, assistantMsgId, steering: { id, text, files, status, acceptedAt, appliedAt? } }`。
- 运行结果：`{ type: "runOutcome", outcome: "completed" | "awaitingApproval" | "error" | "stopped", chatId, assistantMsgId, error?, approvalRequest? }`。
- 仍发送原有 `approvalRequest`、文本/action/observation 等事件和 `[DONE]`。`[DONE]` 只表示流结束，不表示任务成功。Agent 的结果事件在 `[DONE]` 前发送，每次运行最多一个。

前端应按 `assistantMsgId` 绑定运行、按 `steering.id` 去重；202 响应与 SSE 可能重复、先后顺序不固定。`accepted` 表示已记录并排队，`applied` 表示已写入下一次模型调用的上下文，不保证模型执行成功。结果事件是本次运行的终态，审批不是完成。

## 安全边界与持久化

引导仅在完整一轮工具 exchange 后、下一次模型调用前按 FIFO 消费；不会中断执行中的工具、模型请求或拆开 native call/result。最终 respond / 纯文本结束遇到 pending 会延迟，native respond 会记录对应的 deferred result 后继续下一轮。结束前同步关闭接受窗口，避免最终持久化期间误接收。

消息持久化到 session 的 `assistant.steeringMessages`，包含 accepted/applied 状态与时间；兼容旧前端历史保存，保留后端引导记录。图片 base64 只在运行内存中使用，不写入该记录。若审批、错误或停止发生在消费前，记录可能停留在 accepted；不会自动跨运行应用，恢复后需显式重新引导。

附件只允许真实路径位于 uploads 目录内的普通文件，不允许 URL 或任意本地路径（会解析符号链接）。单文件最多 5 MiB，总计 10 MiB，每文件传入的文本预览最多 128 KiB。图片按本地扩展名作为视觉附件传入；不校验图像解码，也不调用外部解析服务。非图片使用传入的解析预览和文件路径，后续文件工具仍遵守现有权限限制。

引导不会撤销已执行操作；最终生成中的预览文本可能已发送，应以现有文本修正事件及后续答复为准。运行仍受原有 60 轮 / 15 分钟限制。引导队列不提供重启恢复、幂等请求键或额外上传鉴权；沿用现有服务访问控制。

测试：`npm test`（backend 目录）。新测试覆盖纯队列、持久化次序、结束窗口、HTTP 绑定冲突、运行替换、附件校验、三种 provider 的 native 配对及终态事件；不调用外部模型服务。