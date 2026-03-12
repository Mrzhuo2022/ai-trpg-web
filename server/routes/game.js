import crypto from "crypto";
import { API_ROUTES, parseActRequestBody, parseStartRequestBody } from "../../shared/contracts.js";
import { callLLMStream } from "../llmClient.js";
import {
  buildReplyMeta,
  hasActionOptions,
  isEndingReply
} from "../meta.js";
import {
  buildOptionFixPrompt,
  makeSystemPrompt
} from "../prompts.js";
import { rollD20, formatDiceForModel, formatDiceChip, calculateDC } from "../judgeEngine.js";
import { initSSE, sendDone, sendError, sendMeta, sendSession, sendStatus, sendToken } from "../sse.js";

function makeTraceId() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

function createTracer({ traceId, routeLabel, diagnosticsStore }) {
  const requestStartedAt = Date.now();
  const timeline = [];

  const markPhase = (phase) => {
    timeline.push({
      phase: String(phase || ""),
      atMs: Date.now() - requestStartedAt
    });
  };

  const statusWithTrace = (res, phase, message, elapsedMs) => {
    markPhase(phase);
    sendStatus(res, {
      phase,
      message,
      elapsedMs: typeof elapsedMs === "number" ? elapsedMs : undefined,
      traceId
    });
  };

  const record = ({ status, phase, elapsedMs, model = "", baseUrl = "", message = "" }) => {
    diagnosticsStore.record({
      traceId,
      route: routeLabel,
      status,
      phase,
      elapsedMs: typeof elapsedMs === "number" ? elapsedMs : Date.now() - requestStartedAt,
      model,
      baseUrl,
      message,
      timeline
    });
  };

  return {
    traceId,
    statusWithTrace,
    record,
    elapsedMs: () => Date.now() - requestStartedAt
  };
}

function buildStatusText(phase) {
  const map = {
    request_sent: "请求已发送到模型服务。",
    connected: "模型已响应，开始流式输出。",
    completed: "模型输出完成。"
  };
  return map[phase] || "处理中";
}

function sendSSEErrorAndDone(res, payload) {
  sendError(res, payload);
  sendDone(res, false);
  res.end();
}

async function streamPrimaryReply({ llmConfig, messages, trace, res }) {
  return callLLMStream({
    ...llmConfig,
    messages,
    onStatus: (phase, elapsedMs) => {
      trace.statusWithTrace(res, phase, buildStatusText(phase), elapsedMs);
    },
    onToken: (token) => {
      sendToken(res, token);
    }
  });
}

function buildOptionFallbackPatch() {
  return [
    "【可选行动】",
    "1. 先观察周围环境，锁定可疑目标与可用掩体。",
    "2. 与现场关键人物交涉，尝试换取情报或资源。",
    "3. 直接执行高风险推进行动，快速触发剧情关键点。"
  ].join("\n");
}

async function applyReplyRepairs({ llmConfig, messages, baseReply, trace, res }) {
  let finalReply = baseReply;

  if (!isEndingReply(finalReply) && !hasActionOptions(finalReply)) {
    // Use fallback immediately instead of calling LLM again
    // This saves significant time (avoids second LLM call)
    const fallbackPatch = buildOptionFallbackPatch();
    sendToken(res, `\n\n${fallbackPatch}`);
    finalReply = `${baseReply}\n\n${fallbackPatch}`;
  }

  return finalReply;
}

/**
 * Handles the common game request lifecycle: tracing, error recording, and response ending.
 */
async function runGameRequestHandler(req, res, { routeLabel, diagnosticsStore, handler }) {
  initSSE(res);
  const trace = createTracer({
    traceId: makeTraceId(),
    routeLabel,
    diagnosticsStore
  });

  let diagInfo = { model: "", baseUrl: "" };

  try {
    await handler({
      trace,
      setDiagInfo: (info) => {
        diagInfo = { ...diagInfo, ...info };
      }
    });
  } catch (error) {
    let message = String(error?.message || error);
    if (error?.name === "ZodError" && Array.isArray(error.errors)) {
      message = `参数验证失败: ${error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ")}`;
    }
    console.error(`[Game API Error] ${routeLabel}:`, error);
    trace.record({
      status: "error",
      phase: "error",
      elapsedMs: trace.elapsedMs(),
      ...diagInfo,
      message
    });
    sendSSEErrorAndDone(res, { message, traceId: trace.traceId });
  }
}

export function registerGameRoutes(app, { sessionStore, diagnosticsStore }) {
  app.post(API_ROUTES.gameStartStream, async (req, res) => {
    await runGameRequestHandler(req, res, {
      routeLabel: API_ROUTES.gameStartStream,
      diagnosticsStore,
      handler: async ({ trace, setDiagInfo }) => {
        const parsed = parseStartRequestBody(req.body);
        const cfg = parsed.llmConfig;
        const diagInfo = { model: cfg.model, baseUrl: cfg.baseUrl };
        setDiagInfo(diagInfo);

        const mergedWorldbook = (parsed.worldbook || parsed.worldSeed || "").trim();
        const systemPrompt = makeSystemPrompt({
          gmPrompt: parsed.gmPrompt,
          ruleset: parsed.ruleset,
          worldName: parsed.worldName,
          worldbook: mergedWorldbook,
          scenarioScript: parsed.scenarioScript,
          characterName: parsed.characterName,
          characterProfile: parsed.characterProfile
        });

        const sessionId = crypto.randomUUID();
        const initialUserMessage = "请直接开始第一幕，把我放进一个高风险但可决策的局面。";
        const messages = [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: initialUserMessage
          }
        ];

        trace.statusWithTrace(res, "queued", "请求已发出，等待模型响应...");

        const gmReply = await streamPrimaryReply({
          llmConfig: cfg,
          messages,
          trace,
          res
        });
        const finalReply = await applyReplyRepairs({
          llmConfig: cfg,
          messages,
          baseReply: gmReply,
          trace,
          res
        });

        sendMeta(res, buildReplyMeta(finalReply));
        sessionStore.create({
          sessionId,
          llmConfig: cfg,
          systemPrompt,
          initialUserMessage,
          finalReply
        });

        sendSession(res, { sessionId, traceId: trace.traceId });
        const totalElapsed = trace.elapsedMs();
        trace.statusWithTrace(res, "completed", "请求完成（服务端结束）", totalElapsed);
        trace.record({
          status: "ok",
          phase: "completed",
          elapsedMs: totalElapsed,
          ...diagInfo,
          message: "请求完成"
        });
        sendDone(res, true);
        res.end();
      }
    });
  });

  app.post(API_ROUTES.gameActStream, async (req, res) => {
    await runGameRequestHandler(req, res, {
      routeLabel: API_ROUTES.gameActStream,
      diagnosticsStore,
      handler: async ({ trace, setDiagInfo }) => {
        const parsed = parseActRequestBody(req.body);

        if (!parsed.sessionId) {
          const message = "会话不存在，请重新开始。";
          trace.record({ status: "error", phase: "invalid_session", message });
          return sendSSEErrorAndDone(res, { message, traceId: trace.traceId });
        }

        const session = sessionStore.get(parsed.sessionId);
        if (!session) {
          const message = "会话不存在或已过期，请重新开始。";
          trace.record({ status: "error", phase: "session_not_found", message });
          return sendSSEErrorAndDone(res, { message, traceId: trace.traceId });
        }

        const diagInfo = {
          model: session.llmConfig?.model || "",
          baseUrl: session.llmConfig?.baseUrl || ""
        };
        setDiagInfo(diagInfo);

        if (sessionStore.isExpired(session)) {
          sessionStore.remove(parsed.sessionId);
          const message = "会话已过期（长时间无操作），请重新开始。";
          trace.record({
            status: "error",
            phase: "session_expired",
            ...diagInfo,
            message
          });
          return sendSSEErrorAndDone(res, { message, traceId: trace.traceId });
        }

        if (!parsed.action) {
          const message = "行动内容不能为空。";
          trace.record({
            status: "error",
            phase: "invalid_action",
            ...diagInfo,
            message
          });
          return sendSSEErrorAndDone(res, { message, traceId: trace.traceId });
        }

        sessionStore.touch(session);

        const roll = rollD20();
        const dc = calculateDC(parsed.action);
        
        if (dc !== null) {
          const diceChip = formatDiceChip(roll, dc);
          sendMeta(res, {
            options: [],
            check: diceChip,
            status: "",
            ended: false
          });
        }

        const messages = [
          ...session.messages,
          { role: "user", content: parsed.action },
          { role: "system", content: formatDiceForModel(roll, parsed.action, dc) }
        ];

        trace.statusWithTrace(res, "queued", "请求已发出，等待模型响应...");

        const gmReply = await streamPrimaryReply({
          llmConfig: session.llmConfig,
          messages,
          trace,
          res
        });
        const finalReply = await applyReplyRepairs({
          llmConfig: session.llmConfig,
          messages,
          baseReply: gmReply,
          trace,
          res
        });

        const replyMeta = buildReplyMeta(finalReply);
        if (dc !== null) {
          replyMeta.check = formatDiceChip(roll, dc);
        }
        sendMeta(res, replyMeta);
        session.messages = sessionStore.trimMessages([...messages, { role: "assistant", content: finalReply }]);
        sessionStore.touch(session);
        sessionStore.enforceLimit();

        const totalElapsed = trace.elapsedMs();
        trace.statusWithTrace(res, "completed", "请求完成（服务端结束）", totalElapsed);
        trace.record({
          status: "ok",
          phase: "completed",
          elapsedMs: totalElapsed,
          model: session.llmConfig?.model || "",
          baseUrl: session.llmConfig?.baseUrl || "",
          message: "请求完成"
        });
        sendDone(res, true);
        res.end();
      }
    });
  });
}
