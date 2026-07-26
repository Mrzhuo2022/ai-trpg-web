import { useState, useRef, useCallback, useEffect } from "react";
import { useAppStore } from "../store/useAppStore";
import { API_ROUTES } from "../../shared/contracts.js";
import { runStreamInteraction } from "../lib/streamInteraction";
import { sessionTitleFromSettings } from "../lib/loreHelpers";
import { uid } from "../lib/utils";
import type { RollRecord, Settings, StreamMetaView } from "../types";
export interface RerollRequest {
  type: "reroll";
}
export interface RegenerateRequest {
  type: "regenerate";
}
export type FollowUpRequest = RerollRequest | RegenerateRequest;

export function useAdventure() {
  const storeActions = useRef(useAppStore.getState());

  // Update ref when store changes
  useEffect(() => {
    storeActions.current = useAppStore.getState();
  });

  const [isStarting, setIsStarting] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [liveMeta, setLiveMeta] = useState<StreamMetaView | null>(null);
  /** 是否正在掷骰动画中（用于锁住 UI） */
  const [isRolling, setIsRolling] = useState(false);
  /** 最近一次失败的普通行动文本（供「重试」按钮使用），成功或取消后清空 */
  const [lastFailedAction, setLastFailedAction] = useState("");
  /** 记录当前回合的玩家行动文本，供掷骰历史使用 */
  const currentActionRef = useRef("");

  const waitingTimerRef = useRef<number | null>(null);
  const waitingStartedRef = useRef(0);

  /** 当前进行中的流式请求控制器；新请求开始或组件卸载时取消旧请求 */
  const streamAbortRef = useRef<AbortController | null>(null);

  const abortActiveStream = useCallback(() => {
    if (streamAbortRef.current) {
      streamAbortRef.current.abort();
      streamAbortRef.current = null;
    }
  }, []);

  const beginStreamAbortController = useCallback(() => {
    abortActiveStream();
    const controller = new AbortController();
    streamAbortRef.current = controller;
    return controller;
  }, [abortActiveStream]);

  useEffect(() => {
    return () => {
      abortActiveStream();
    };
  }, [abortActiveStream]);

  const stopWaitingTicker = useCallback(() => {
    if (waitingTimerRef.current) {
      window.clearInterval(waitingTimerRef.current);
      waitingTimerRef.current = null;
    }
  }, []);

  const startWaitingTicker = useCallback(() => {
    stopWaitingTicker();
    waitingStartedRef.current = Date.now();
    waitingTimerRef.current = window.setInterval(() => {
      const sec = Math.max(1, Math.floor((Date.now() - waitingStartedRef.current) / 1000));
      storeActions.current.setStatus(`请求已发出，等待响应中（${sec}s）`, "pending");
    }, 1000);
  }, [stopWaitingTicker]);

  useEffect(() => {
    return () => {
      stopWaitingTicker();
    };
  }, [stopWaitingTicker]);

  const executeStreamInteraction = useCallback(
    (params: {
      sessionId: string;
      endpoint: string;
      body: Record<string, unknown>;
      successLabel: string;
      modelLabel?: string;
      signal?: AbortSignal;
      onSession?: (backendSessionId: string) => void;
      onMeta?: (meta: StreamMetaView) => void;
    }) =>
      runStreamInteraction(params, {
        addMessage: storeActions.current.addMessage,
        appendToMessage: storeActions.current.appendToMessage,
        removeMessage: storeActions.current.removeMessage,
        persistSessionsNow: storeActions.current.persistSessionsNow,
        setStatus: storeActions.current.setStatus,
        stopWaitingTicker,
        markSessionEnded: storeActions.current.markSessionEnded
      }),
    [stopWaitingTicker]
  );

  /**
   * 处理收到的 meta：更新 liveMeta，并把结构化判定/资源同步到 session（用于战绩面板）
   */
  const handleMeta = useCallback((sessionId: string, meta: StreamMetaView) => {
    setLiveMeta((prev) => {
      // 合并：新值优先，空值保留旧值（兼容预动画 + 最终两次 meta）
      const merged: StreamMetaView = {
        check: meta.check || prev?.check || "",
        status: meta.status || prev?.status || "",
        ended: meta.ended,
        roll: meta.roll ?? prev?.roll,
        modifier: meta.modifier ?? prev?.modifier,
        attribute: meta.attribute ?? prev?.attribute,
        attributeLabel: meta.attributeLabel ?? prev?.attributeLabel,
        attributeAbbr: meta.attributeAbbr ?? prev?.attributeAbbr,
        total: meta.total ?? prev?.total,
        dc: meta.dc ?? prev?.dc,
        success: meta.success ?? prev?.success,
        quality: meta.quality ?? prev?.quality,
        category: meta.category ?? prev?.category,
        categoryLabel: meta.categoryLabel ?? prev?.categoryLabel,
        difficulty: meta.difficulty ?? prev?.difficulty,
        label: meta.label ?? prev?.label,
        rolling: meta.rolling ?? prev?.rolling,
        isReroll: meta.isReroll ?? prev?.isReroll,
        consumedLuck: meta.consumedLuck ?? prev?.consumedLuck,
        canReroll: meta.canReroll ?? prev?.canReroll,
        regenerated: meta.regenerated ?? prev?.regenerated,
        luckPoints: meta.luckPoints ?? prev?.luckPoints,
        maxLuckPoints: meta.maxLuckPoints ?? prev?.maxLuckPoints,
        pressure: meta.pressure ?? prev?.pressure,
        damage: meta.damage ?? prev?.damage,
        stateAfter: meta.stateAfter ?? prev?.stateAfter,
        characterState: meta.characterState ?? prev?.characterState
      };
      return merged;
    });

    // 同步运行时状态到 session（用于战绩面板与持久化）
    const sync: { luckPoints?: number; maxLuckPoints?: number; pressure?: StreamMetaView["pressure"]; characterState?: StreamMetaView["characterState"] } = {};
    if (typeof meta.luckPoints === "number") sync.luckPoints = meta.luckPoints;
    if (typeof meta.maxLuckPoints === "number") sync.maxLuckPoints = meta.maxLuckPoints;
    if (meta.pressure) sync.pressure = meta.pressure;
    if (meta.characterState) sync.characterState = meta.characterState;
    if (Object.keys(sync).length) {
      storeActions.current.syncSessionRuntime(sessionId, sync);
    }

    // 掷骰动画：收到 rolling=true 时锁住，收到 rolling=false 时解锁
    if (typeof meta.rolling === "boolean") {
      setIsRolling(meta.rolling);
    }

    // 最终判定（rolling=false 且有 roll）：写入掷骰历史
    if (meta.rolling === false && typeof meta.roll === "number" && typeof meta.dc === "number") {
      const record: RollRecord = {
        id: uid(),
        roll: meta.roll,
        dc: meta.dc,
        success: Boolean(meta.success),
        quality: meta.quality || "fail",
        category: meta.category || "general",
        categoryLabel: meta.categoryLabel,
        attribute: meta.attribute ?? null,
        attributeLabel: meta.attributeLabel ?? null,
        modifier: meta.modifier,
        total: meta.total,
        action: currentActionRef.current || "行动",
        createdAt: Date.now(),
        isReroll: Boolean(meta.isReroll)
      };
      storeActions.current.addRollRecord(sessionId, record);
    }
  }, []);

  const startAdventureForSession = useCallback(
    async (sessionId: string, runtimeSettings: Settings, forcedTitle?: string) => {
      // baseUrl/apiKey/model 均可为空：服务端可通过 LLM_BASE_URL / LLM_API_KEY / LLM_MODEL
      // 环境变量提供；缺失时由服务端返回明确错误提示
      const model = runtimeSettings.model.trim();
      const modelName = model || "服务端默认";

      setLiveMeta(null);
      setIsRolling(false);
      setIsStarting(true);
      storeActions.current.clearSessionForRestart(sessionId);

      const title = forcedTitle ? forcedTitle.slice(0, 40) : sessionTitleFromSettings(runtimeSettings);
      storeActions.current.updateSessionTitle(sessionId, title);

      storeActions.current.setStatus(`准备开场（模型：${modelName}）...`, "pending");
      startWaitingTicker();

      let nextBackendSessionId = "";
      const controller = beginStreamAbortController();
      const result = await executeStreamInteraction({
        sessionId,
        signal: controller.signal,
        endpoint: API_ROUTES.gameStartStream,
        body: {
          llmConfig: {
            baseUrl: runtimeSettings.baseUrl,
            apiKey: runtimeSettings.apiKey,
            model
          },
          gmPrompt: runtimeSettings.gmPrompt,
          ruleset: runtimeSettings.ruleset,
          worldName: runtimeSettings.worldName,
          worldbook: runtimeSettings.worldbook,
          scenarioScript: runtimeSettings.scenarioScript,
          characterName: runtimeSettings.characterName,
          characterProfile: runtimeSettings.characterProfile,
          // D&D 5e 结构化角色属性
          attrStr: runtimeSettings.attrStr,
          attrDex: runtimeSettings.attrDex,
          attrCon: runtimeSettings.attrCon,
          attrInt: runtimeSettings.attrInt,
          attrWis: runtimeSettings.attrWis,
          attrCha: runtimeSettings.attrCha,
          baseHp: runtimeSettings.baseHp,
          baseAc: runtimeSettings.baseAc,
          corruptionName: runtimeSettings.corruptionName,
          corruptionMax: runtimeSettings.corruptionMax,
          corruptionThreshold: runtimeSettings.corruptionThreshold,
          initialResources: runtimeSettings.initialResources || []
        },
        successLabel: "模型请求成功",
        modelLabel: modelName,
        onSession: (backendSessionId) => {
          nextBackendSessionId = backendSessionId;
        },
        onMeta: (meta) => handleMeta(sessionId, meta)
      });

      if (streamAbortRef.current === controller) {
        streamAbortRef.current = null;
      }

      if (result.ok) {
        storeActions.current.setSessionBackendId(sessionId, nextBackendSessionId);
      } else if ("aborted" in result && result.aborted) {
        storeActions.current.setStatus("开场已取消。", "idle");
      } else {
        storeActions.current.addMessage(sessionId, "error", result.error);
        storeActions.current.setStatus(`模型请求失败（${modelName}）：${result.error}`, "error");
      }

      stopWaitingTicker();
      setIsStarting(false);
    },
    [startWaitingTicker, executeStreamInteraction, stopWaitingTicker, handleMeta, beginStreamAbortController]
  );

  const sendActionText = useCallback(
    async (
      sessionId: string,
      backendSessionId: string,
      action: string,
      isCurrentRoundEnded: boolean,
      followUp?: FollowUpRequest
    ) => {
      if (isCurrentRoundEnded) {
        storeActions.current.setStatus("本次冒险已结束，请点击「重开剧情」开始新章节。", "ok");
        return;
      }
      const finalAction = action.trim();
      if (!finalAction) return;
      if (!backendSessionId) {
        storeActions.current.setStatus("当前会话未开场，请先开始开场。", "error");
        return;
      }

      setIsSending(true);
      setLiveMeta(null);
      // 防御：每次发行动前强制复位掷骰动画状态，避免上一回合的 rolling=true
      // 未被 rolling=false 复位（流式中断/出错时）导致 DiceOverlay 遮罩永久盖住界面
      setIsRolling(false);

      // 记录本次行动到 ref，供 handleMeta 写入掷骰历史
      currentActionRef.current = finalAction;

      // 普通行动才在 UI 加入 user 消息；重投/重生成由后端覆盖最后一条 assistant
      if (!followUp) {
        storeActions.current.addMessage(sessionId, "user", finalAction);
      }

      storeActions.current.setStatus(
        followUp?.type === "reroll" ? "重投判定中..." : followUp?.type === "regenerate" ? "重写叙事中..." : "行动已发送，等待回应...",
        "pending"
      );
      startWaitingTicker();

      const body: Record<string, unknown> = { sessionId: backendSessionId, action: finalAction };
      if (followUp?.type === "reroll") {
        // 原骰值由服务端从掷骰历史自取，客户端不上报
        body.reroll = true;
      } else if (followUp?.type === "regenerate") {
        body.regenerate = true;
        // 重生成不需要 action，但保留以便后端兼容
        delete body.action;
      }

      const controller = beginStreamAbortController();
      const result = await executeStreamInteraction({
        sessionId,
        signal: controller.signal,
        endpoint: API_ROUTES.gameActStream,
        body,
        successLabel: followUp?.type === "reroll" ? "重投完成" : followUp?.type === "regenerate" ? "重写完成" : "模型请求成功",
        onMeta: (meta) => handleMeta(sessionId, meta)
      });

      if (streamAbortRef.current === controller) {
        streamAbortRef.current = null;
      }

      stopWaitingTicker();
      setIsSending(false);
      // 兜底：请求结束后强制复位掷骰动画，防止 rolling 状态卡住导致界面被遮罩锁死
      setIsRolling(false);

      if (result.ok) {
        setLastFailedAction("");
      } else if ("aborted" in result && result.aborted) {
        storeActions.current.setStatus("请求已取消。", "idle");
        setLastFailedAction("");
      } else if (followUp) {
        storeActions.current.setStatus(`${followUp.type === "reroll" ? "重投" : "重写"}失败：${result.error}`, "error");
      } else {
        // 普通行动失败：提示并记录失败行动，供「重试」按钮一键重发
        storeActions.current.setStatus(`行动失败：${result.error}`, "error");
        setLastFailedAction(finalAction);
      }
    },
    [startWaitingTicker, executeStreamInteraction, stopWaitingTicker, handleMeta, beginStreamAbortController]
  );

  /** 用户主动停止当前流式生成 */
  const cancelStream = useCallback(() => {
    abortActiveStream();
  }, [abortActiveStream]);

  return {
    isStarting,
    isSending,
    isRolling,
    liveMeta,
    setLiveMeta,
    lastFailedAction,
    cancelStream,
    startAdventureForSession,
    sendActionText
  };
}
