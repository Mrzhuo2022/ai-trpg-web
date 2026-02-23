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
import { rollD20, formatDiceForModel, formatDiceChip } from "../judgeEngine.js";
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
    trace.statusWithTrace(res, "repairing_options", "主持人正在补全可选行动...");
    try {
      const optionPatch = await callLLMStream({
        ...llmConfig,
        messages: [
          ...messages,
          { role: "assistant", content: baseReply },
          { role: "user", content: buildOptionFixPrompt() }
        ],
        onToken: (token) => sendToken(res, token)
      });
      finalReply = `${baseReply}\n\n${optionPatch}`;
    } catch {
      const fallbackPatch = buildOptionFallbackPatch();
      sendToken(res, `\n\n${fallbackPatch}`);
      finalReply = `${baseReply}\n\n${fallbackPatch}`;
    }
  }

  return finalReply;
}

export function registerGameRoutes(app, { sessionStore, diagnosticsStore }) {
  app.post(API_ROUTES.gameStartStream, async (req, res) => {
    initSSE(res);
    const trace = createTracer({
      traceId: makeTraceId(),
      routeLabel: API_ROUTES.gameStartStream,
      diagnosticsStore
    });
    let diagModel = "";
    let diagBaseUrl = "";

    try {
      const parsed = parseStartRequestBody(req.body);
      const cfg = parsed.llmConfig;
      diagModel = cfg.model;
      diagBaseUrl = cfg.baseUrl;

      sessionStore.cleanupExpired();

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
      const messages = [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: "请直接开始第一幕，把我放进一个高风险但可决策的局面。"
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
        finalReply
      });

      sendSession(res, { sessionId, traceId: trace.traceId });
      const totalElapsed = trace.elapsedMs();
      trace.statusWithTrace(res, "completed", "请求完成（服务端结束）", totalElapsed);
      trace.record({
        status: "ok",
        phase: "completed",
        elapsedMs: totalElapsed,
        model: diagModel,
        baseUrl: diagBaseUrl,
        message: "请求完成"
      });
      sendDone(res, true);
      res.end();
    } catch (error) {
      const message = String(error?.message || error);
      trace.record({
        status: "error",
        phase: "error",
        elapsedMs: trace.elapsedMs(),
        model: diagModel,
        baseUrl: diagBaseUrl,
        message
      });
      sendSSEErrorAndDone(res, { message, traceId: trace.traceId });
    }
  });

  app.post(API_ROUTES.gameActStream, async (req, res) => {
    initSSE(res);
    const trace = createTracer({
      traceId: makeTraceId(),
      routeLabel: API_ROUTES.gameActStream,
      diagnosticsStore
    });
    let diagModel = "";
    let diagBaseUrl = "";

    try {
      const parsed = parseActRequestBody(req.body);
      sessionStore.cleanupExpired();

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

      diagModel = session.llmConfig?.model || "";
      diagBaseUrl = session.llmConfig?.baseUrl || "";

      if (sessionStore.isExpired(session)) {
        sessionStore.remove(parsed.sessionId);
        const message = "会话已过期（长时间无操作），请重新开始。";
        trace.record({
          status: "error",
          phase: "session_expired",
          model: diagModel,
          baseUrl: diagBaseUrl,
          message
        });
        return sendSSEErrorAndDone(res, { message, traceId: trace.traceId });
      }

      if (!parsed.action) {
        const message = "行动内容不能为空。";
        trace.record({
          status: "error",
          phase: "invalid_action",
          model: diagModel,
          baseUrl: diagBaseUrl,
          message
        });
        return sendSSEErrorAndDone(res, { message, traceId: trace.traceId });
      }

      sessionStore.touch(session);

      // Roll d20 and inject into conversation
      const roll = rollD20();
      const diceChip = formatDiceChip(roll);
      sendMeta(res, {
        options: [],
        check: diceChip,
        status: "",
        ended: false
      });

      const messages = [
        ...session.messages,
        { role: "user", content: parsed.action },
        { role: "system", content: formatDiceForModel(roll, parsed.action) }
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
      replyMeta.check = diceChip;
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
        model: diagModel,
        baseUrl: diagBaseUrl,
        message: "请求完成"
      });
      sendDone(res, true);
      res.end();
    } catch (error) {
      const message = String(error?.message || error);
      trace.record({
        status: "error",
        phase: "error",
        elapsedMs: trace.elapsedMs(),
        model: diagModel,
        baseUrl: diagBaseUrl,
        message
      });
      sendSSEErrorAndDone(res, { message, traceId: trace.traceId });
    }
  });
}
