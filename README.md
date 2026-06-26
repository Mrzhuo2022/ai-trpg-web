# AI TRPG Console

基于 React + Zustand + TypeScript 的 AI 驱动 TRPG（桌上角色扮演游戏）平台。

## ✨ 特性

### 用户端
- 📚 **书架系统** - 选择剧本直接开场
- 🎮 **沉浸式游玩** - 流式输出，实时响应
- 🎯 **智能判定** - 自动 d20 掷骰与 DC 计算
- 🔄 **重新开始** - 已结束剧本可快速重开
- 💾 **自动保存** - 本地会话持久化

### 管理端
- 🔧 **API 配置** - 支持 OpenAI 兼容接口
- 👁️ **安全输入** - API Key 显示/隐藏切换
- 📝 **剧本编辑** - 世界观、角色、规则自定义
- 💾 **预设管理** - 保存/加载/导入/导出
- 🎨 **响应式设计** - 自适应各种屏幕

### 性能优化
- ⚡ **LRU 缓存** - 解析结果缓存
- 🔄 **自动重试** - 指数退避重试机制
- 🧹 **内存管理** - 防止内存泄漏
- 📦 **批量更新** - 减少 localStorage 写入

## 页面划分

- 用户端书架：`/library`
- 用户端游玩：`/play`
- 管理端：`/admin`

## 用户端功能

- 书架选剧本，点一本直接开场
- 沉浸式聊天游玩界面
- 主持人回复支持结构化 `meta`（选项/判定/状态/结局），并渲染为可点击按钮
- 也支持自定义输入行动
- 剧本结束后可重新开始

## 管理端功能

- 配置 Base URL / API Key / Model
- API Key 显示/隐藏切换
- 优化模型选择下拉框
- 编辑世界观、规则、角色、主持人提示词
- 预设保存/加载/删除
- JSON 导入/导出预设

## 启动

```bash
npm install
```

### 开发（推荐：一键启动前后端）

```bash
npm run dev:all
```

一条命令同时启动后端 API（默认 `3157`）与前端 Vite 开发服务（默认 `5173`，带热更新）。
日志会以 `[api]` / `[web]` 前缀区分。打开 `http://localhost:5173` 即可游玩。

> 也可以分别启动：`npm run dev`（后端）、`npm run dev:web`（前端）。

### 生产（单进程）

```bash
npm run build:web
npm start
```

构建后，后端会自动托管 `dist/` 静态资源，只需一个进程。打开 `http://localhost:3157` 即可游玩完整应用。

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
- `DEFAULT_MAX_TOKENS`：LLM 响应最大 token 数（默认 `1000`）

## 后端结构

- 启动入口：`server.js`
- 应用装配：`server/app.js`
- 路由：`server/routes/*.js`
- LLM 客户端：`server/llmClient.js`
- 元信息提取：`server/meta.js`
- 提示词构建：`server/prompts.js`
- 状态与诊断存储：`server/stores/*.js`

## 技术栈

**前端**
- React 18 + TypeScript
- Zustand（状态管理）
- Vite（构建工具）
- SSE（服务器推送）

**后端**
- Node.js + Express
- OpenAI API（LLM 接口）
- Zod（数据校验）

## 开发

```bash
npm install
```

开发模式：

终端 A（后端）：
```bash
npm run dev
```

终端 B（前端）：
```bash
npm run dev:web
```

生产构建：

```bash
npm run build:web
npm run start
```

## License

MIT
