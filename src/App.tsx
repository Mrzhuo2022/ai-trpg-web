import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "./store/useAppStore";
import { parseAssistantContent, isEndingText } from "./lib/parseHelpers";
import { API_ROUTES } from "../shared/contracts.js";
import {
  patchFromLore,
  extractCareerOptionsFromProfile,
  attachCareerToProfile,
  sessionTitleFromSettings
} from "./lib/loreHelpers";
import type { CareerOption } from "./lib/loreHelpers";
import { runStreamInteraction } from "./lib/streamInteraction";
import { AdminView } from "./components/AdminView";
import { ShelfView } from "./components/ShelfView";
import { PlayView } from "./components/PlayView";
import { useNavigation } from "./hooks/useNavigation";
import { usePresetManager } from "./hooks/usePresetManager";
import type { Preset, Settings, StreamMetaView } from "./types";

export default function App() {
  const { view, navigate } = useNavigation();

  const pm = usePresetManager();

  // Zustand selectors – subscribe only to needed slices
  const settings = useAppStore((s) => s.settings);
  const sessions = useAppStore((s) => s.sessions);
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const presets = useAppStore((s) => s.presets);
  const status = useAppStore((s) => s.status);

  // Actions are stable references – read once
  const {
    init,
    setStatus,
    updateSettings,
    createSession,
    selectSession,
    persistSessionsNow,
    clearSessionForRestart,
    setSessionBackendId,
    updateSessionTitle,
    addMessage,
    appendToMessage
  } = useAppStore.getState();

  const [isStarting, setIsStarting] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [liveMeta, setLiveMeta] = useState<StreamMetaView | null>(null);
  const [careerPickerPresetId, setCareerPickerPresetId] = useState("");
  const [selectedCareerName, setSelectedCareerName] = useState("");

  const waitingTimerRef = useRef<number | null>(null);
  const waitingStartedRef = useRef(0);
  const chatRef = useRef<HTMLDivElement | null>(null);

  const scrollChatToBottom = () => {
    if (!chatRef.current) return;
    chatRef.current.scrollTop = chatRef.current.scrollHeight;
  };

  const activeSession = useMemo(
    () => sessions.find((s) => s.localId === activeSessionId) || null,
    [sessions, activeSessionId]
  );

  const latestMessageContent = useMemo(() => {
    if (!activeSession?.messages.length) return "";
    const last = activeSession.messages[activeSession.messages.length - 1];
    return last?.content || "";
  }, [activeSession?.messages]);

  const latestSessionByPresetId = useMemo(() => {
    const map = new Map<string, (typeof sessions)[number]>();
    for (const session of sessions) {
      if (!session.sourcePresetId) continue;
      const prev = map.get(session.sourcePresetId);
      if (!prev || session.updatedAt > prev.updatedAt) {
        map.set(session.sourcePresetId, session);
      }
    }
    return map;
  }, [sessions]);

  const careerOptionsByPresetId = useMemo(() => {
    const map = new Map<string, CareerOption[]>();
    for (const preset of presets) {
      map.set(preset.id, extractCareerOptionsFromProfile(preset.data.characterProfile || ""));
    }
    return map;
  }, [presets]);

  const careerPickerPreset = useMemo(
    () => presets.find((preset) => preset.id === careerPickerPresetId) || null,
    [careerPickerPresetId, presets]
  );

  const careerPickerOptions = useMemo(
    () => (careerPickerPreset ? careerOptionsByPresetId.get(careerPickerPreset.id) || [] : []),
    [careerPickerPreset, careerOptionsByPresetId]
  );

  const latestAssistantMessage = useMemo(
    () => [...(activeSession?.messages || [])].reverse().find((msg) => msg.role === "assistant") || null,
    [activeSession?.messages]
  );

  const latestAssistantView = useMemo(
    () => (latestAssistantMessage ? parseAssistantContent(latestAssistantMessage.content) : null),
    [latestAssistantMessage?.content]
  );

  const isCurrentRoundEnded = useMemo(
    () => isEndingText(latestAssistantMessage?.content || ""),
    [latestAssistantMessage?.content]
  );

  const quickOptions = useMemo(() => {
    if (isCurrentRoundEnded) return [];
    return latestAssistantView?.options || [];
  }, [latestAssistantView?.options, isCurrentRoundEnded]);

  const latestMetaView = useMemo(() => {
    if (liveMeta && (liveMeta.check || liveMeta.status)) {
      return liveMeta;
    }
    if (!latestAssistantView || (!latestAssistantView.check && !latestAssistantView.status)) {
      return null;
    }
    return {
      check: latestAssistantView.check,
      status: latestAssistantView.status,
      ended: false
    } satisfies StreamMetaView;
  }, [liveMeta, latestAssistantView?.check, latestAssistantView?.status]);

  const isStreaming = isStarting || isSending;

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    setLiveMeta(null);
  }, [activeSessionId]);

  useLayoutEffect(() => {
    if (view !== "play") return;
    scrollChatToBottom();
  }, [activeSession?.messages.length, latestMessageContent, activeSessionId, view]);

  useEffect(() => {
    if (view !== "play") return;
    if (!isStreaming) return;
    scrollChatToBottom();
    let rafId = 0;
    const tick = () => {
      scrollChatToBottom();
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isStreaming, view, activeSessionId]);

  useEffect(
    () => () => {
      if (waitingTimerRef.current) {
        window.clearInterval(waitingTimerRef.current);
      }
    },
    []
  );

  const stopWaitingTicker = () => {
    if (waitingTimerRef.current) {
      window.clearInterval(waitingTimerRef.current);
      waitingTimerRef.current = null;
    }
  };

  const startWaitingTicker = () => {
    stopWaitingTicker();
    waitingStartedRef.current = Date.now();
    waitingTimerRef.current = window.setInterval(() => {
      const sec = Math.max(1, Math.floor((Date.now() - waitingStartedRef.current) / 1000));
      setStatus(`请求已发出，等待响应中（${sec}s）`, "pending");
    }, 1000);
  };

  const executeStreamInteraction = (params: {
    sessionId: string;
    endpoint: typeof API_ROUTES.gameStartStream | typeof API_ROUTES.gameActStream;
    body: Record<string, unknown>;
    successLabel: string;
    modelLabel?: string;
    onSession?: (backendSessionId: string) => void;
    onMeta?: (meta: StreamMetaView) => void;
  }) =>
    runStreamInteraction(params, {
      addMessage,
      appendToMessage,
      persistSessionsNow,
      setStatus,
      stopWaitingTicker
    });

  const startAdventureForSession = async (sessionId: string, runtimeSettings: Settings, forcedTitle?: string) => {
    const modelName = runtimeSettings.model.trim();
    if (!modelName || !runtimeSettings.baseUrl.trim() || !runtimeSettings.apiKey.trim()) {
      setStatus("该剧本未配置可用模型服务，请联系管理员预设 API。", "error");
      return;
    }

    setLiveMeta(null);
    setIsStarting(true);
    clearSessionForRestart(sessionId);

    const title = forcedTitle ? forcedTitle.slice(0, 40) : sessionTitleFromSettings(runtimeSettings);
    updateSessionTitle(sessionId, title);

    setStatus(`准备开场（模型：${modelName}）...`, "pending");
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
        setLiveMeta((prev: StreamMetaView | null) => ({
          check: meta.check || prev?.check || "",
          status: meta.status || prev?.status || "",
          ended: meta.ended
        }));
      }
    });

    if (result.ok) {
      setSessionBackendId(sessionId, nextBackendSessionId);
    } else {
      addMessage(sessionId, "error", result.error);
      setStatus(`模型请求失败（${modelName}）：${result.error}`, "error");
    }

    stopWaitingTicker();
    setIsStarting(false);
  };

  const handleStartAdventure = async () => {
    if (!activeSession) return;
    if (activeSession.messages.length > 0 && !window.confirm("确认重开？当前进度将被清空。")) return;
    const runtimeSettings = useAppStore.getState().settings;
    await startAdventureForSession(activeSession.localId, runtimeSettings);
  };

  const sendActionText = async (action: string) => {
    if (!activeSession) return;
    if (isCurrentRoundEnded) {
      setStatus("本次冒险已结束，请点击「重开剧情」开始新章节。", "ok");
      return;
    }
    const finalAction = action.trim();
    if (!finalAction) return;
    if (!activeSession.backendSessionId) {
      setStatus("当前会话未开场，请先开始开场。", "error");
      return;
    }

    setIsSending(true);
    setLiveMeta(null);

    addMessage(activeSession.localId, "user", finalAction);

    setStatus("行动已发送，等待回应...", "pending");
    startWaitingTicker();

    const result = await executeStreamInteraction({
      sessionId: activeSession.localId,
      endpoint: API_ROUTES.gameActStream,
      body: {
        sessionId: activeSession.backendSessionId,
        action: finalAction
      },
      successLabel: "模型请求成功",
      onMeta: (meta) => {
        setLiveMeta((prev: StreamMetaView | null) => ({
          check: meta.check || prev?.check || "",
          status: meta.status || prev?.status || "",
          ended: meta.ended
        }));
      }
    });

    if (!result.ok) {
      addMessage(activeSession.localId, "error", result.error);
      setStatus(`模型请求失败：${result.error}`, "error");
    }

    stopWaitingTicker();
    setIsSending(false);
  };

  const openCareerPickerForPreset = (preset: Preset) => {
    const options = careerOptionsByPresetId.get(preset.id) || [];
    if (!options.length) {
      void handleStartFromShelf(preset);
      return;
    }
    const defaultCareer =
      options.find((option) => option.name === settings.characterName)?.name || options[0]?.name || "";
    setCareerPickerPresetId(preset.id);
    setSelectedCareerName(defaultCareer);
  };

  const handleStartFromShelf = async (preset: Preset, chosenCareer = "") => {
    const patch = patchFromLore(preset.data);
    const base = useAppStore.getState().settings;
    const runtimeSettings: Settings = { ...base, ...patch };
    const existing = latestSessionByPresetId.get(preset.id);

    if (chosenCareer.trim()) {
      runtimeSettings.characterName = chosenCareer.trim();
      runtimeSettings.characterProfile = attachCareerToProfile(runtimeSettings.characterProfile, chosenCareer.trim());
      patch.characterName = runtimeSettings.characterName;
      patch.characterProfile = runtimeSettings.characterProfile;
    }

    if (Object.keys(patch).length) {
      updateSettings(patch);
    }

    if (existing && existing.messages.length > 0) {
      selectSession(existing.localId);
      navigate("play");
      setStatus(`已恢复进度：${preset.name}`, "ok");
      return;
    }

    const sessionId =
      existing?.localId ||
      createSession({
        title: preset.name.slice(0, 40),
        sourcePresetId: preset.id
      });

    selectSession(sessionId);
    navigate("play");
    await startAdventureForSession(sessionId, runtimeSettings, preset.name);
  };

  const handleConfirmCareerAndStart = async () => {
    if (!careerPickerPreset) return;
    const chosen = selectedCareerName.trim();
    if (!chosen) {
      setStatus("请先选择职业。", "error");
      return;
    }
    const preset = careerPickerPreset;
    setCareerPickerPresetId("");
    setSelectedCareerName("");
    await handleStartFromShelf(preset, chosen);
  };

  /* ── Render ── */

  if (view === "admin") {
    return (
      <AdminView
        settings={settings}
        presets={presets}
        models={pm.models}
        status={status}
        presetName={pm.presetName}
        presetId={pm.presetId}
        isLoadingModels={pm.isLoadingModels}
        fileInputRef={pm.fileInputRef}
        onUpdateSetting={pm.updateSetting}
        onNavigate={() => navigate("library")}
        onSetPresetName={pm.setPresetName}
        onSetPresetId={pm.setPresetId}
        onLoadModels={() => void pm.handleLoadModels()}
        onSavePreset={pm.handleSavePreset}
        onUpdateCurrentPreset={pm.handleUpdateCurrentPreset}
        onLoadPreset={pm.handleLoadPreset}
        onDeletePreset={pm.handleDeletePreset}
        onExportLore={pm.handleExportLore}
        onImportLore={pm.handleImportLore}
      />
    );
  }

  return (
    <main className="user-shell">
      {view === "library" ? (
        <ShelfView
          presets={presets}
          isStarting={isStarting}
          latestSessionByPresetId={latestSessionByPresetId}
          careerOptionsByPresetId={careerOptionsByPresetId}
          careerPickerPreset={careerPickerPreset}
          careerPickerOptions={careerPickerOptions}
          selectedCareerName={selectedCareerName}
          onStartFromShelf={(preset) => void handleStartFromShelf(preset)}
          onOpenCareerPicker={openCareerPickerForPreset}
          onSetSelectedCareerName={setSelectedCareerName}
          onCancelCareerPicker={() => {
            setCareerPickerPresetId("");
            setSelectedCareerName("");
          }}
          onConfirmCareerAndStart={() => void handleConfirmCareerAndStart()}
        />
      ) : (
        <PlayView
          activeSession={activeSession}
          status={status}
          isStarting={isStarting}
          isSending={isSending}
          isCurrentRoundEnded={isCurrentRoundEnded}
          quickOptions={quickOptions}
          latestMetaView={latestMetaView}
          chatRef={chatRef}
          onNavigate={() => navigate("library")}
          onStartAdventure={() => void handleStartAdventure()}
          onSendAction={(text) => void sendActionText(text)}
        />
      )}
    </main>
  );
}
