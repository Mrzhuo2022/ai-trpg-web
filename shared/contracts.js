import { z } from "zod";

export const API_ROUTES = Object.freeze({
  models: "/api/models",
  diagnosticsRecent: "/api/diagnostics/recent",
  gameStartStream: "/api/game/start-stream",
  gameActStream: "/api/game/act-stream"
});

export const SSE_EVENTS = Object.freeze({
  status: "status",
  token: "token",
  meta: "meta",
  session: "session",
  error: "error",
  done: "done"
});

const STATUS_SET = new Set(["ok", "error"]);
const SSE_EVENT_SET = new Set(Object.values(SSE_EVENTS));

function ensureRecord(value, fallback = {}) {
  return value && typeof value === "object" ? value : fallback;
}

const optionalTrimmedStringSchema = z.preprocess((value) => (typeof value === "string" ? value.trim() : ""), z.string());

function requiredTrimmedStringSchema(fieldLabel) {
  return z.preprocess(
    (value) => {
      if (typeof value !== "string") return value;
      let val = value.trim();
      // 如果是 baseUrl 且不含协议，尝试补全（仅针对常见模型 API）
      if (fieldLabel === "baseUrl" && val && !/^https?:\/\//i.test(val)) {
        val = `https://${val}`;
      }
      return val;
    },
    z.string().min(1, `${fieldLabel} 不能为空。`)
  );
}

const MAX_SHORT_FIELD = 200;
const MAX_LONG_FIELD = 60000;
const MAX_ACTION_LENGTH = 4000;

function optionalBoundedStringSchema(max) {
  return z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : ""),
    z.string().max(max, `字段长度不能超过 ${max} 字符。`)
  );
}

// baseUrl 可为空（服务端可通过 LLM_BASE_URL 环境变量提供）；非空时自动补全协议
const optionalBaseUrlSchema = z.preprocess((value) => {
  if (typeof value !== "string") return "";
  let val = value.trim();
  if (val && !/^https?:\/\//i.test(val)) {
    val = `https://${val}`;
  }
  return val;
}, z.string());

const modelsRequestSchema = z.object({
  llmConfig: z.object({
    // baseUrl / apiKey 均可为空：服务端可通过 LLM_BASE_URL / LLM_API_KEY 环境变量提供
    baseUrl: optionalBaseUrlSchema,
    apiKey: optionalTrimmedStringSchema
  })
});

const optionalNumberStringSchema = z.preprocess(
  (value) => {
    if (value === null || value === undefined || value === "") return "";
    const n = Number(value);
    return Number.isFinite(n) ? String(Math.floor(n)) : "";
  },
  z.string()
);

const startRequestSchema = z.object({
  llmConfig: z.object({
    // baseUrl / apiKey 均可为空：服务端可通过 LLM_BASE_URL / LLM_API_KEY 环境变量提供
    baseUrl: optionalBaseUrlSchema,
    apiKey: optionalTrimmedStringSchema,
    model: optionalTrimmedStringSchema
  }),
  gmPrompt: optionalBoundedStringSchema(MAX_LONG_FIELD),
  ruleset: optionalBoundedStringSchema(MAX_LONG_FIELD),
  worldName: optionalBoundedStringSchema(MAX_SHORT_FIELD),
  worldbook: optionalBoundedStringSchema(MAX_LONG_FIELD),
  scenarioScript: optionalBoundedStringSchema(MAX_LONG_FIELD),
  characterName: optionalBoundedStringSchema(MAX_SHORT_FIELD),
  characterProfile: optionalBoundedStringSchema(MAX_LONG_FIELD),
  worldSeed: optionalBoundedStringSchema(MAX_LONG_FIELD),
  // 角色属性（D&D 5e 六维），字符串形式存数字
  attrStr: optionalNumberStringSchema,
  attrDex: optionalNumberStringSchema,
  attrCon: optionalNumberStringSchema,
  attrInt: optionalNumberStringSchema,
  attrWis: optionalNumberStringSchema,
  attrCha: optionalNumberStringSchema,
  baseHp: optionalNumberStringSchema,
  baseAc: optionalNumberStringSchema,
  corruptionName: optionalTrimmedStringSchema,
  corruptionMax: optionalNumberStringSchema,
  corruptionThreshold: optionalNumberStringSchema,
  // 初始物品清单（[{name,qty,unit}]）
  initialResources: z.array(z.any()).optional()
});

const actRequestSchema = z.object({
  sessionId: optionalTrimmedStringSchema,
  action: optionalBoundedStringSchema(MAX_ACTION_LENGTH),
  // 玩家请求重投上一次失败的判定（消耗 1 点运气）
  reroll: z.preprocess((value) => value === true || value === "true", z.boolean()).optional(),
  // 玩家请求重新生成上一回合叙事（不改骰子，不消耗运气）
  regenerate: z.preprocess((value) => value === true || value === "true", z.boolean()).optional()
  // 注：原骰值由服务端从 rollHistory 自取，不接受客户端上报（防作弊）
});

const diagnosticsQuerySchema = z.object({
  limit: z
    .preprocess((value) => {
      const n = Number(value);
      return Number.isFinite(n) ? n : undefined;
    }, z.number().int().optional())
    .optional(),
  status: optionalTrimmedStringSchema
});

const statusPayloadSchema = z.object({
  phase: optionalTrimmedStringSchema,
  message: optionalTrimmedStringSchema,
  traceId: optionalTrimmedStringSchema
});

const tokenPayloadSchema = z.object({
  token: optionalTrimmedStringSchema
});

const sessionPayloadSchema = z.object({
  sessionId: optionalTrimmedStringSchema,
  traceId: optionalTrimmedStringSchema
});

const errorPayloadSchema = z.object({
  message: optionalTrimmedStringSchema,
  traceId: optionalTrimmedStringSchema
});

const donePayloadSchema = z.object({
  ok: z.coerce.boolean()
});

const metaPayloadSchema = z.object({
  options: z.array(optionalTrimmedStringSchema).optional().default([]),
  check: optionalTrimmedStringSchema,
  status: optionalTrimmedStringSchema,
  ended: z.preprocess((value) => {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (normalized === "true") return true;
      if (normalized === "false") return false;
    }
    return Boolean(value);
  }, z.boolean())
});

function sanitizeMetaOptions(value) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => optionalTrimmedStringSchema.parse(item))
        .filter(Boolean)
        .map((item) => item.replace(/^\d+[\.、)]\s*/, "").replace(/^[-*]\s*/, "").trim())
        .filter(Boolean)
    )
  ).slice(0, 5);
}

export function isKnownSSEEvent(event) {
  return typeof event === "string" && SSE_EVENT_SET.has(event);
}

export function parseModelsRequestBody(body) {
  return modelsRequestSchema.parse(ensureRecord(body));
}

export function parseStartRequestBody(body) {
  return startRequestSchema.parse(ensureRecord(body));
}

export function parseActRequestBody(body) {
  return actRequestSchema.parse(ensureRecord(body));
}

export function parseDiagnosticsQuery(query) {
  const root = diagnosticsQuerySchema.parse(ensureRecord(query));
  const parsedLimit = root.limit;
  const limit = Number.isFinite(parsedLimit) ? Math.min(200, Math.max(1, Math.floor(parsedLimit))) : 40;
  const statusRaw = root.status.toLowerCase();
  const status = STATUS_SET.has(statusRaw) ? statusRaw : "";
  return { limit, status };
}

export function normalizeStatusPayload(payload) {
  const root = ensureRecord(payload);
  const parsed = statusPayloadSchema.parse(root);
  return {
    phase: parsed.phase,
    message: parsed.message,
    elapsedMs: Number.isFinite(root.elapsedMs) ? Number(root.elapsedMs) : undefined,
    traceId: parsed.traceId
  };
}

export function normalizeTokenPayload(payload) {
  return tokenPayloadSchema.parse(ensureRecord(payload));
}

export function normalizeSessionPayload(payload) {
  return sessionPayloadSchema.parse(ensureRecord(payload));
}

export function normalizeErrorPayload(payload) {
  return errorPayloadSchema.parse(ensureRecord(payload));
}

export function normalizeDonePayload(payload) {
  return donePayloadSchema.parse(ensureRecord(payload));
}

export function normalizeMetaPayload(payload) {
  const record = ensureRecord(payload);
  const parsed = metaPayloadSchema.parse(record);
  return {
    // 保留服务端下发的结构化判定字段（roll/dc/luckPoints/pressure/damage/characterState 等），
    // 仅对公共字段做归一化，避免白名单丢字段导致前端判定 UI 拿不到数据
    ...record,
    options: sanitizeMetaOptions(parsed.options),
    check: parsed.check,
    status: parsed.status,
    ended: parsed.ended
  };
}

export function normalizeSSEPayload(event, payload) {
  if (event === SSE_EVENTS.status) return normalizeStatusPayload(payload);
  if (event === SSE_EVENTS.token) return normalizeTokenPayload(payload);
  if (event === SSE_EVENTS.session) return normalizeSessionPayload(payload);
  if (event === SSE_EVENTS.error) return normalizeErrorPayload(payload);
  if (event === SSE_EVENTS.done) return normalizeDonePayload(payload);
  if (event === SSE_EVENTS.meta) return normalizeMetaPayload(payload);
  return payload;
}
