import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import { AdminView } from "./components/AdminView";
import { ShelfView } from "./components/ShelfView";
import { PlayView } from "./components/PlayView";
import { useNavigation } from "./hooks/useNavigation";
import { usePresetManager } from "./hooks/usePresetManager";
import { useAdventure } from "./hooks/useAdventure";
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
  const storeActions = useMemo(() => useAppStore.getState(), []);
  const { init, setStatus } = storeActions;

  const {
    isStarting,
    isSending,
    liveMeta,
    setLiveMeta,
    startAdventureForSession,
    sendActionText
  } = useAdventure();

  const [careerPickerPresetId, setCareerPickerPresetId] = useState("");
  const [selectedCareerName, setSelectedCareerName] = useState("");

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

  const handleStartAdventure = useCallback(async () => {
    if (!activeSession) return;
    if (activeSession.messages.length > 0 && !window.confirm("确认重开？当前进度将被清空。")) return;
    const runtimeSettings = useAppStore.getState().settings;
    await startAdventureForSession(activeSession.localId, runtimeSettings);
  }, [activeSession, startAdventureForSession]);

  const handleSendAction = useCallback(async (action: string) => {
    if (!activeSession) return;
    await sendActionText(
      activeSession.localId,
      activeSession.backendSessionId,
      action,
      isCurrentRoundEnded
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
          isCurrentRoundEnded={isCurrentRoundEnded}
          quickOptions={quickOptions}
          latestMetaView={latestMetaView}
          chatRef={chatRef}
          onNavigate={() => navigate("library")}
          onNavigateToAdmin={() => navigate("admin")}
          onStartAdventure={handleStartAdventure}
          onSendAction={handleSendAction}
        />
      )}
    </main>
  );
}
