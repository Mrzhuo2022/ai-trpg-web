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
  buildRoundContext,
  makeSystemPrompt
} from "../prompts.js";
import { rollD20, formatDiceForModel, formatDiceChip, calculateDC, evaluateCheckWithAction, applyCheckConsequences, calculatePressure, pressureFromFailStreak } from "../judgeEngine.js";
import { createCharacterState, summarizeState } from "../characterState.js";
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
 * 重写上一回合的 GM 叙事（不改骰子、不消耗运气）
 * 从 session.messages 末尾移除最后一条 assistant 回复，
 * 用相同的 user+system 上下文重新调一次 LLM。
 */
async function regenerateLastReply({ session, trace, res }) {
  const messages = Array.isArray(session.messages) ? session.messages : [];
  if (messages.length < 2) return false;

  // 找到最后一条 assistant
  let lastAssistantIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "assistant") {
      lastAssistantIdx = i;
      break;
    }
  }
  if (lastAssistantIdx <= 0) return false;

  const baseMessages = messages.slice(0, lastAssistantIdx);
  const ctxMessage = session.pressure
    ? { role: "system", content: `【回合动态上下文】\n局势压力：${["平稳", "紧张", "危急", "绝境"][session.pressure.level] || "平稳"}（${session.pressure.level}/3）。请据此渲染紧迫感。` }
    : null;

  const llmMessages = ctxMessage ? [...baseMessages, ctxMessage] : baseMessages;

  trace.statusWithTrace(res, "queued", "重写上一回合叙事...");

  const gmReply = await streamPrimaryReply({
    llmConfig: session.llmConfig,
    messages: llmMessages,
    trace,
    res
  });
  const finalReply = await applyReplyRepairs({
    llmConfig: session.llmConfig,
    messages: llmMessages,
    baseReply: gmReply,
    trace,
    res
  });

  const replyMeta = buildReplyMeta(finalReply);
  replyMeta.luckPoints = session.luckPoints ?? 0;
  replyMeta.maxLuckPoints = session.maxLuckPoints ?? 0;
  replyMeta.pressure = session.pressure || { level: 0, hint: "局势平稳，可以谨慎推进。" };
  replyMeta.regenerated = true;
  sendMeta(res, replyMeta);

  session.messages = sessionStore.trimMessages([...llmMessages.slice(0, baseMessages.length), { role: "assistant", content: finalReply }]);
  sessionStore.touch(session);
  return true;
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

        // 初始化角色状态（D&D 5e 结构化属性）
        const characterState = createCharacterState({
          attributes: {
            str: parsed.attrStr,
            dex: parsed.attrDex,
            con: parsed.attrCon,
            int: parsed.attrInt,
            wis: parsed.attrWis,
            cha: parsed.attrCha
          },
          baseHp: parsed.baseHp,
          baseAc: parsed.baseAc,
          corruptionName: parsed.corruptionName || "腐化",
          corruptionMax: parsed.corruptionMax,
          corruptionThreshold: parsed.corruptionThreshold,
          initialResources: Array.isArray(parsed.initialResources) ? parsed.initialResources : []
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

        sendMeta(res, {
          ...buildReplyMeta(finalReply),
          luckPoints: sessionStore.initialLuckPoints,
          maxLuckPoints: sessionStore.initialLuckPoints,
          pressure: { level: 0, hint: "局势平稳，可以谨慎推进。" },
          characterState
        });
        sessionStore.create({
          sessionId,
          llmConfig: cfg,
          systemPrompt,
          initialUserMessage,
          finalReply,
          characterState
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

        if (!parsed.action && !parsed.reroll && !parsed.regenerate) {
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

        // ── 重生成分支：不改骰子、不消耗运气，仅重新生成上一回合叙事 ──
        if (parsed.regenerate) {
          const regenerated = await regenerateLastReply({ session, trace, res });
          if (!regenerated) {
            return sendSSEErrorAndDone(res, { message: "没有可重写的上一回合。", traceId: trace.traceId });
          }
          const totalElapsed = trace.elapsedMs();
          trace.statusWithTrace(res, "completed", "重写完成", totalElapsed);
          trace.record({
            status: "ok",
            phase: "completed",
            elapsedMs: totalElapsed,
            model: session.llmConfig?.model || "",
            baseUrl: session.llmConfig?.baseUrl || "",
            message: "重写完成"
          });
          sendDone(res, true);
          res.end();
          return;
        }

        // ── 准备判定上下文：取最近消息文本用于情境修正与压力推算 ──
        const contextText = (session.messages || [])
          .slice(-6)
          .map((m) => (typeof m?.content === "string" ? m.content : ""))
          .join("\n");

        const action = parsed.action || "重投上一回合的行动";

        // ── 重投分支：消耗 1 点运气，保留两次中更好的结果 ──
        let roll;
        let checkInfo = calculateDC(action, contextText);
        let isReroll = false;
        let consumedLuck = false;

        if (parsed.reroll) {
          if ((session.luckPoints ?? 0) <= 0) {
            const message = "运气点已耗尽，无法重投。";
            trace.record({ status: "error", phase: "no_luck", ...diagInfo, message });
            return sendSSEErrorAndDone(res, { message, traceId: trace.traceId });
          }
          isReroll = true;
          consumedLuck = true;
          session.luckPoints -= 1;

          // 重投：保留两次中更好的结果
          const originalRoll = Number.isFinite(parsed.originalRoll) ? parsed.originalRoll : null;
          const newRoll = rollD20();
          if (originalRoll !== null && originalRoll >= newRoll) {
            roll = originalRoll; // 旧骰更好，保留旧结果（但仍消耗运气，叙事可换）
          } else {
            roll = newRoll; // 新骰更好，采用新结果
          }
        } else {
          roll = rollD20();
        }

        // 结构化评估（带属性调整值，D&D 5e 检定）
        const attributes = session.characterState?.attributes || null;
        const evaluated = checkInfo
          ? evaluateCheckWithAction(roll, checkInfo.dc, checkInfo, attributes, action)
          : null;

        // 应用检定后果（代码化伤害：失败扣 HP/腐化）
        let damage = null;
        if (evaluated && session.characterState) {
          const result = applyCheckConsequences(session.characterState, evaluated);
          session.characterState = result.state;
          damage = result.damage;
        }

        // 推送预动画 meta（前端据此触发掷骰动画）
        if (evaluated) {
          sendMeta(res, {
            options: [],
            check: formatDiceChip(evaluated),
            status: "",
            ended: false,
            roll: evaluated.roll,
            modifier: evaluated.modifier,
            attribute: evaluated.attribute,
            attributeLabel: evaluated.attributeLabel,
            attributeAbbr: evaluated.attributeAbbr,
            total: evaluated.total,
            dc: evaluated.dc,
            success: evaluated.success,
            quality: evaluated.quality,
            category: evaluated.category,
            categoryLabel: evaluated.categoryLabel,
            difficulty: evaluated.difficulty,
            label: evaluated.label,
            rolling: true,
            isReroll,
            luckPoints: session.luckPoints ?? 0,
            maxLuckPoints: session.maxLuckPoints ?? 0
          });
        }

        // ── 构建本回合消息：含判定注入 + 角色状态 + 局势压力 ──
        const basePressure = calculatePressure(session.messages || []);
        const pressure = pressureFromFailStreak(session.failStreak || 0, basePressure);
        session.pressure = pressure;

        const characterStateSummary = session.characterState
          ? summarizeState(session.characterState, { pressureLevel: pressure.level })
          : "";

        const roundContext = buildRoundContext({
          pressure,
          recentRolls: (session.rollHistory || []).slice(-3),
          characterStateSummary
        });

        const userActionMessage = { role: "user", content: action };
        const judgeMessage = evaluated && session.characterState
          ? { role: "system", content: formatDiceForModel(evaluated, action, damage, session.characterState) }
          : evaluated
            ? { role: "system", content: formatDiceForModel(evaluated, action, null, { hp: { current: 0, max: 0, temp: 0 }, corruption: { name: "腐化", current: 0, max: 100 }, conditions: [] }) }
            : null;

        const contextMessage = roundContext
          ? { role: "system", content: `【回合动态上下文】\n${roundContext}` }
          : null;

        const messages = [
          ...session.messages,
          userActionMessage,
          ...([judgeMessage, contextMessage].filter(Boolean))
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

        // ── 更新运行时状态：掷骰历史、连续失败计数 ──
        if (evaluated) {
          const rollRecord = {
            id: crypto.randomUUID().replace(/-/g, "").slice(0, 10),
            roll: evaluated.roll,
            dc: evaluated.dc,
            success: evaluated.success,
            quality: evaluated.quality,
            category: evaluated.category,
            categoryLabel: evaluated.categoryLabel,
            action: action.slice(0, 80),
            createdAt: Date.now(),
            isReroll
          };
          session.rollHistory = [...(session.rollHistory || []), rollRecord].slice(-100);

          if (evaluated.success) {
            session.failStreak = 0;
          } else {
            session.failStreak = (session.failStreak || 0) + 1;
          }
        }

        const replyMeta = buildReplyMeta(finalReply);
        if (evaluated) {
          replyMeta.check = formatDiceChip(evaluated);
          replyMeta.roll = evaluated.roll;
          replyMeta.modifier = evaluated.modifier;
          replyMeta.attribute = evaluated.attribute;
          replyMeta.attributeLabel = evaluated.attributeLabel;
          replyMeta.attributeAbbr = evaluated.attributeAbbr;
          replyMeta.total = evaluated.total;
          replyMeta.dc = evaluated.dc;
          replyMeta.success = evaluated.success;
          replyMeta.quality = evaluated.quality;
          replyMeta.category = evaluated.category;
          replyMeta.categoryLabel = evaluated.categoryLabel;
          replyMeta.label = evaluated.label;
          replyMeta.rolling = false;
          replyMeta.isReroll = isReroll;
          replyMeta.consumedLuck = consumedLuck;
          // 伤害与状态变化（前端据此更新 HP 条/腐化条）
          if (damage) {
            replyMeta.damage = damage;
          }
          if (session.characterState) {
            replyMeta.stateAfter = {
              hp: { ...session.characterState.hp },
              ac: session.characterState.ac,
              corruption: { ...session.characterState.corruption },
              conditions: [...session.characterState.conditions]
            };
          }
          // 可重投条件：失败 + 仍有运气点 + 非结局 + 角色未倒下
          replyMeta.canReroll = !evaluated.success
            && (session.luckPoints ?? 0) > 0
            && !replyMeta.ended
            && !(session.characterState?.conditions || []).includes("downed");
        }
        replyMeta.luckPoints = session.luckPoints ?? 0;
        replyMeta.maxLuckPoints = session.maxLuckPoints ?? 0;
        replyMeta.pressure = pressure;
        if (session.characterState) {
          replyMeta.characterState = session.characterState;
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
