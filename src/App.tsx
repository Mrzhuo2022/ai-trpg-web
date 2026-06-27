import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "./store/useAppStore";
import { parseAssistantContent, isEndingText } from "./lib/parseHelpers";
import {
  patchFromLore,
  extractCareerOptionsFromProfile,
  attachCareerToProfile
} from "./lib/loreHelpers";
import type { CareerOption } from "./lib/loreHelpers";
import { AdminView } from "./components/AdminView";
import { ShelfView } from "./components/ShelfView";
import { PlayView } from "./components/PlayView";
import { useNavigation } from "./hooks/useNavigation";
import { usePresetManager } from "./hooks/usePresetManager";
import { useAdventure } from "./hooks/useAdventure";
import type { Preset, Session, Settings, StreamMetaView } from "./types";

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
  const storeActions = useMemo(() => useAppStore.getState(), []);
  const { init } = storeActions;

  const {
    isStarting,
    isSending,
    isRolling,
    liveMeta,
    setLiveMeta,
    startAdventureForSession,
    sendActionText
  } = useAdventure();

  const [careerPickerPresetId, setCareerPickerPresetId] = useState("");
  const [selectedCareerName, setSelectedCareerName] = useState("");

  const chatRef = useRef<HTMLDivElement | null>(null);
  // 是否贴底（用户上滚后置 false，不再强制跟随；新回合/切换会话时重置为 true）
  const stickToBottomRef = useRef(true);

  const scrollChatToBottom = useCallback(() => {
    const el = chatRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  // 用户手动滚动时更新贴底标记
  const handleChatScroll = useCallback(() => {
    const el = chatRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distFromBottom < 80;
  }, []);

  const activeSession = useMemo(
    () => sessions.find((s) => s.localId === activeSessionId) || null,
    [sessions, activeSessionId]
  );

  const latestMessageContent = useMemo(() => {
    if (!activeSession?.messages.length) return "";
    const last = activeSession.messages[activeSession.messages.length - 1];
    return last?.content || "";
  }, [activeSession?.messages]);

  // 书架视图专用：只在 library 视图才重算，避免 play 页流式时每个 token 都重建 Map
  const latestSessionByPresetIdRef = useRef<Map<string, Session>>(new Map());
  const careerOptionsByPresetIdRef = useRef<Map<string, CareerOption[]>>(new Map());

  const latestSessionByPresetId = useMemo(() => {
    if (view !== "library") return latestSessionByPresetIdRef.current;
    const map = new Map<string, (typeof sessions)[number]>();
    for (const session of sessions) {
      if (!session.sourcePresetId) continue;
      const prev = map.get(session.sourcePresetId);
      if (!prev || session.updatedAt > prev.updatedAt) {
        map.set(session.sourcePresetId, session);
      }
    }
    latestSessionByPresetIdRef.current = map;
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, view]);

  const careerOptionsByPresetId = useMemo(() => {
    if (view !== "library") return careerOptionsByPresetIdRef.current;
    const map = new Map<string, CareerOption[]>();
    for (const preset of presets) {
      map.set(preset.id, extractCareerOptionsFromProfile(preset.data.characterProfile || ""));
    }
    careerOptionsByPresetIdRef.current = map;
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presets, view]);

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

  // 切换会话/视图/新回合开始时：重置贴底并滚到底
  useLayoutEffect(() => {
    if (view !== "play") return;
    stickToBottomRef.current = true;
    scrollChatToBottom();
  }, [activeSessionId, view, scrollChatToBottom]);

  // 消息内容变化（非流式增量）：只在贴底时跟随
  useLayoutEffect(() => {
    if (view !== "play") return;
    if (!stickToBottomRef.current) return;
    scrollChatToBottom();
  }, [activeSession?.messages.length, latestMessageContent, view, scrollChatToBottom]);

  // 流式期间：节流滚动（每 ~120ms 一次，而非每帧），且尊重用户的上滚意图
  useEffect(() => {
    if (view !== "play") return;
    if (!isStreaming) return;
    // 进入流式时若用户正在看历史，不要强制拉回
    const interval = window.setInterval(() => {
      if (stickToBottomRef.current) scrollChatToBottom();
    }, 120);
    return () => window.clearInterval(interval);
  }, [isStreaming, view, scrollChatToBottom]);

  // 把 scroll 监听绑到 story-stream 容器
  useEffect(() => {
    const el = chatRef.current;
    if (!el) return;
    el.addEventListener("scroll", handleChatScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleChatScroll);
  }, [handleChatScroll, view, activeSessionId]);

  const handleStartAdventure = useCallback(async () => {
    if (!activeSession) return;
    if (activeSession.messages.length > 0 && !window.confirm("确认重开？当前进度将被清空。")) return;
    const runtimeSettings = useAppStore.getState().settings;
    // 防御：apiKey/baseUrl/model 任一缺失都给出明确提示，避免静默失败让用户以为“重开没反应”
    if (!runtimeSettings.model.trim() || !runtimeSettings.baseUrl.trim() || !runtimeSettings.apiKey.trim()) {
      storeActions.setStatus("重开失败：未配置 baseUrl / apiKey / model，请到设置页补全。", "error");
      return;
    }
    await startAdventureForSession(activeSession.localId, runtimeSettings);
  }, [activeSession, startAdventureForSession, storeActions]);

  const handleSendAction = useCallback(async (action: string) => {
    if (!activeSession) return;
    await sendActionText(
      activeSession.localId,
      activeSession.backendSessionId,
      action,
      isCurrentRoundEnded
    );
  }, [activeSession, sendActionText, isCurrentRoundEnded]);

  // 重投：消耗 1 点运气，重新掷骰判定同一行动
  const handleReroll = useCallback(async (originalRoll: number, action: string) => {
    if (!activeSession) return;
    await sendActionText(
      activeSession.localId,
      activeSession.backendSessionId,
      action || "重投上一回合的行动",
      isCurrentRoundEnded,
      { type: "reroll", originalRoll }
    );
  }, [activeSession, sendActionText, isCurrentRoundEnded]);

  // 重写叙事：不改骰子，重新生成上一回合叙事
  const handleRegenerate = useCallback(async () => {
    if (!activeSession) return;
    await sendActionText(
      activeSession.localId,
      activeSession.backendSessionId,
      "",
      isCurrentRoundEnded,
      { type: "regenerate" }
    );
  }, [activeSession, sendActionText, isCurrentRoundEnded]);

  const handleStartFromShelf = useCallback(async (preset: Preset, chosenCareer = "") => {
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
      storeActions.updateSettings(patch);
    }

    // For ended sessions or sessions with no messages, clear and restart
    const shouldRestart = existing && (existing.isEnded || existing.messages.length === 0);
    if (shouldRestart) {
      storeActions.clearSessionForRestart(existing.localId);
      storeActions.selectSession(existing.localId);
      navigate("play");
      await startAdventureForSession(existing.localId, runtimeSettings, preset.name);
      return;
    }

    if (existing && existing.messages.length > 0) {
      storeActions.selectSession(existing.localId);
      navigate("play");
      storeActions.setStatus(`已恢复进度：${preset.name}`, "ok");
      return;
    }

    const sessionId = storeActions.createSession({
      title: preset.name.slice(0, 40),
      sourcePresetId: preset.id
    });

    storeActions.selectSession(sessionId);
    navigate("play");
    await startAdventureForSession(sessionId, runtimeSettings, preset.name);
  }, [latestSessionByPresetId, storeActions, navigate, startAdventureForSession]);

  const openCareerPickerForPreset = useCallback((preset: Preset) => {
    const options = careerOptionsByPresetId.get(preset.id) || [];
    if (!options.length) {
      void handleStartFromShelf(preset);
      return;
    }
    const defaultCareer =
      options.find((option) => option.name === settings.characterName)?.name || options[0]?.name || "";
    setCareerPickerPresetId(preset.id);
    setSelectedCareerName(defaultCareer);
  }, [careerOptionsByPresetId, settings.characterName, handleStartFromShelf]);

  const handleConfirmCareerAndStart = useCallback(async () => {
    if (!careerPickerPreset) return;
    const chosen = selectedCareerName.trim();
    if (!chosen) {
      storeActions.setStatus("请先选择职业。", "error");
      return;
    }
    const preset = careerPickerPreset;
    setCareerPickerPresetId("");
    setSelectedCareerName("");
    await handleStartFromShelf(preset, chosen);
  }, [careerPickerPreset, selectedCareerName, handleStartFromShelf]);

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
          onStartFromShelf={handleStartFromShelf}
          onOpenCareerPicker={openCareerPickerForPreset}
          onSetSelectedCareerName={setSelectedCareerName}
          onCancelCareerPicker={() => {
            setCareerPickerPresetId("");
            setSelectedCareerName("");
          }}
          onConfirmCareerAndStart={handleConfirmCareerAndStart}
          onNavigateToAdmin={() => navigate("admin")}
        />
      ) : (
        <PlayView
          activeSession={activeSession}
          status={status}
          isStarting={isStarting}
          isSending={isSending}
          isRolling={isRolling}
          isCurrentRoundEnded={isCurrentRoundEnded}
          quickOptions={quickOptions}
          latestMetaView={latestMetaView}
          showCheckCard={
            Boolean(
              latestMetaView?.rolling === false &&
              typeof latestMetaView?.roll === "number" &&
              typeof latestMetaView?.dc === "number" &&
              latestMetaView?.quality
            )
          }
          chatRef={chatRef}
          onNavigate={() => navigate("library")}
          onNavigateToAdmin={() => navigate("admin")}
          onStartAdventure={handleStartAdventure}
          onSendAction={handleSendAction}
          onReroll={handleReroll}
          onRegenerate={handleRegenerate}
        />
      )}
    </main>
  );
}
