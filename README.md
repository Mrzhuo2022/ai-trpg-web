# AI TRPG Console (React + Zustand + TypeScript)

## 页面划分

- 用户端书架：`/library`
- 用户端游玩：`/play`
- 管理端：`/admin`

说明：用户端不显示管理配置入口；管理端通过 URL 进入。

## 用户端功能

- 书架选剧本，点一本直接开场
- 沉浸式聊天游玩界面
- 主持人回复支持结构化 `meta`（选项/判定/状态/结局），并渲染为可点击按钮
- 也支持自定义输入行动

## 管理端功能

- 配置 Base URL / API Key / Model
- 编辑世界观、规则、角色、主持人提示词
- 预设保存/加载/删除
- JSON 导入/导出预设

## 启动

```bash
cd /home/evarle/Codefiles/ai-trpg-web
npm install
```

开发：

终端 A：
```bash
npm run dev
```

终端 B：
```bash
npm run dev:web
```

说明：

- `3157` 端口是纯 API 服务（不再托管前端页面）
- 前端页面请使用 Vite 开发端口（默认 `5173`）

生产：

```bash
npm run build:web
npm run start
```

## API

- `POST /api/models`
- `GET /api/diagnostics/recent`
- `POST /api/game/start-stream`
- `POST /api/game/act-stream`

共享协议（前后端同源）：

- `shared/contracts.js`
- 路由常量：`API_ROUTES`
- SSE 事件常量：`SSE_EVENTS`
- 请求/查询解析：`parseStartRequestBody` / `parseActRequestBody` / `parseModelsRequestBody` / `parseDiagnosticsQuery`
- SSE 负载规范化：`normalizeSSEPayload`
- 运行时校验：基于 `zod`（请求体与 SSE 负载）

SSE 事件（`start-stream` / `act-stream`）：

- `status`：请求状态（排队、连接、补全、完成）
  - 额外字段：`traceId`
- `token`：模型流式文本
- `meta`：结构化信息 `{ options, check, status, ended }`
- `session`：后端会话 ID（仅开场）
- `error`：错误信息
- `done`：流结束标记

判定机制：

- `act-stream` 回合由后端执行真实 `d20` 掷骰与 DC 对比
- 判定结果会注入主持人上下文，模型必须按结果叙事
- 判定摘要会写入 `meta.check`，前端在判定信息条展示

## 会话治理（后端）

支持环境变量：

- `SESSION_TTL_MS`：会话空闲过期时间（默认 `21600000`，即 6 小时）
- `MAX_SESSIONS`：内存会话上限（默认 `200`）
- `SESSION_SWEEP_INTERVAL_MS`：后台清理周期（默认 `60000`）
- `MAX_SESSION_MESSAGES`：单会话消息上限（默认 `42`，含 system）
- `MAX_DIAGNOSTICS`：内存诊断日志上限（默认 `300`）

## 后端结构

- 启动入口：`server.js`
- 应用装配：`server/app.js`
- 路由：`server/routes/*.js`
- LLM 客户端：`server/llmClient.js`
- 元信息提取：`server/meta.js`
- 提示词构建：`server/prompts.js`
- 状态与诊断存储：`server/stores/*.js`
