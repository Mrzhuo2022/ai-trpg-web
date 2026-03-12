import { useState, useRef, useCallback, useEffect } from "react";
import { useAppStore } from "../store/useAppStore";
import { API_ROUTES } from "../../shared/contracts.js";
import { runStreamInteraction } from "../lib/streamInteraction";
import { sessionTitleFromSettings } from "../lib/loreHelpers";
import type { Settings, StreamMetaView } from "../types";

export function useAdventure() {
  const storeActions = useRef(useAppStore.getState());

  // Update ref when store changes
  useEffect(() => {
    storeActions.current = useAppStore.getState();
  });

  const [isStarting, setIsStarting] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [liveMeta, setLiveMeta] = useState<StreamMetaView | null>(null);

  const waitingTimerRef = useRef<number | null>(null);
  const waitingStartedRef = useRef(0);

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
      onSession?: (backendSessionId: string) => void;
      onMeta?: (meta: StreamMetaView) => void;
    }) =>
      runStreamInteraction(params, {
        addMessage: storeActions.current.addMessage,
        appendToMessage: storeActions.current.appendToMessage,
        persistSessionsNow: storeActions.current.persistSessionsNow,
        setStatus: storeActions.current.setStatus,
        stopWaitingTicker,
        markSessionEnded: storeActions.current.markSessionEnded
      }),
    [stopWaitingTicker]
  );

  const startAdventureForSession = useCallback(
    async (sessionId: string, runtimeSettings: Settings, forcedTitle?: string) => {
      const modelName = runtimeSettings.model.trim();
      if (!modelName || !runtimeSettings.baseUrl.trim() || !runtimeSettings.apiKey.trim()) {
        storeActions.current.setStatus("该剧本未配置可用模型服务，请联系管理员预设 API。", "error");
        return;
      }

      setLiveMeta(null);
      setIsStarting(true);
      storeActions.current.clearSessionForRestart(sessionId);

      const title = forcedTitle ? forcedTitle.slice(0, 40) : sessionTitleFromSettings(runtimeSettings);
      storeActions.current.updateSessionTitle(sessionId, title);

      storeActions.current.setStatus(`准备开场（模型：${modelName}）...`, "pending");
      startWaitingTicker();

      let nextBackendSessionId = "";
      const result = await executeStreamInteraction({
        sessionId,
        endpoint: API_ROUTES.gameStartStream,
        body: {
          llmConfig: {
            baseUrl: runtimeSettings.baseUrl,
            apiKey: runtimeSettings.apiKey,
            model: modelName
          },
          gmPrompt: runtimeSettings.gmPrompt,
          ruleset: runtimeSettings.ruleset,
          worldName: runtimeSettings.worldName,
          worldbook: runtimeSettings.worldbook,
          scenarioScript: runtimeSettings.scenarioScript,
          characterName: runtimeSettings.characterName,
          characterProfile: runtimeSettings.characterProfile
        },
        successLabel: "模型请求成功",
        modelLabel: modelName,
        onSession: (backendSessionId) => {
          nextBackendSessionId = backendSessionId;
        },
        onMeta: (meta) => {
          setLiveMeta((prev) => ({
            check: meta.check || prev?.check || "",
            status: meta.status || prev?.status || "",
            ended: meta.ended
          }));
        }
      });

      if (result.ok) {
        storeActions.current.setSessionBackendId(sessionId, nextBackendSessionId);
      } else {
        storeActions.current.addMessage(sessionId, "error", result.error);
        storeActions.current.setStatus(`模型请求失败（${modelName}）：${result.error}`, "error");
      }

      stopWaitingTicker();
      setIsStarting(false);
    },
    [startWaitingTicker, executeStreamInteraction, stopWaitingTicker]
  );

  const sendActionText = useCallback(
    async (sessionId: string, backendSessionId: string, action: string, isCurrentRoundEnded: boolean) => {
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

      storeActions.current.addMessage(sessionId, "user", finalAction);

      storeActions.current.setStatus("行动已发送，等待回应...", "pending");
      startWaitingTicker();

      await executeStreamInteraction({
        sessionId,
        endpoint: API_ROUTES.gameActStream,
        body: {
          sessionId: backendSessionId,
          action: finalAction
        },
        successLabel: "模型请求成功",
        onMeta: (meta) => {
          setLiveMeta((prev) => ({
            check: meta.check || prev?.check || "",
            status: meta.status || prev?.status || "",
            ended: meta.ended
          }));
        }
      });

      stopWaitingTicker();
      setIsSending(false);
    },
    [startWaitingTicker, executeStreamInteraction, stopWaitingTicker]
  );

  return {
    isStarting,
    isSending,
    liveMeta,
    setLiveMeta,
    startAdventureForSession,
    sendActionText
  };
}
