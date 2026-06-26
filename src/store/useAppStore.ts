import { create } from "zustand";
import { DEFAULT_SETTINGS } from "../lib/constants";
import {
  loadActiveSessionId,
  loadPresets,
  loadSessions,
  loadSettings,
  saveActiveSessionId,
  savePresets,
  saveSessions,
  saveSettings
} from "../lib/storage";
import { uid } from "../lib/utils";
import type { AppStatus, CharacterState, ChatRole, Pressure, Preset, RollRecord, Session, Settings } from "../types";

interface AppState {
  settings: Settings;
  sessions: Session[];
  activeSessionId: string;
  presets: Preset[];
  status: AppStatus;

  init: () => void;
  setStatus: (text: string, type?: AppStatus["type"]) => void;
  updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  updateSettings: (patch: Partial<Settings>) => void;

  createSession: (options?: { title?: string; sourcePresetId?: string }) => string;
  selectSession: (id: string) => void;
  persistSessionsNow: () => void;
  clearSessionForRestart: (id: string) => void;
  setSessionBackendId: (id: string, backendId: string) => void;
  updateSessionTitle: (id: string, title: string) => void;
  markSessionEnded: (id: string) => void;
  /** 同步某会话的运行时状态（运气点、掷骰历史、压力、角色状态）—— 由 useAdventure 在收到 meta 后调用 */
  syncSessionRuntime: (id: string, patch: Partial<Pick<Session, "luckPoints" | "maxLuckPoints" | "rollHistory" | "pressure" | "characterState">>) => void;
  addRollRecord: (id: string, record: RollRecord) => void;
  spendLuck: (id: string, amount?: number) => void;

  addMessage: (sessionId: string, role: ChatRole, content: string) => string;
  appendToMessage: (sessionId: string, messageId: string, chunk: string) => void;
  /** 替换最后一条 assistant 消息（用于重生成/重投） */
  replaceLastAssistantMessage: (sessionId: string, content: string) => void;

  savePreset: (name: string, data: Preset["data"]) => { ok: boolean; message: string };
  loadPresetById: (id: string) => Preset | null;
  deletePresetById: (id: string) => { ok: boolean; message: string };
}

function normalizeSession(raw: Partial<Session>): Session {
  return {
    localId: raw.localId || uid(),
    backendSessionId: raw.backendSessionId || "",
    sourcePresetId: typeof raw.sourcePresetId === "string" ? raw.sourcePresetId : "",
    title: raw.title || "未命名跑团",
    createdAt: typeof raw.createdAt === "number" ? raw.createdAt : Date.now(),
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : Date.now(),
    messages: Array.isArray(raw.messages)
      ? raw.messages
          .filter((m) => m && typeof m === "object")
          .map((m) => ({
            id: m.id || uid(),
            role: (m.role as ChatRole) || "assistant",
            content: typeof m.content === "string" ? m.content : ""
          }))
      : [],
    isEnded: Boolean(raw.isEnded),
    luckPoints: typeof raw.luckPoints === "number" ? raw.luckPoints : 0,
    maxLuckPoints: typeof raw.maxLuckPoints === "number" ? raw.maxLuckPoints : 0,
    rollHistory: Array.isArray(raw.rollHistory) ? raw.rollHistory : [],
    pressure: raw.pressure && typeof raw.pressure === "object" && typeof raw.pressure.level === "number"
      ? (raw.pressure as Pressure)
      : { level: 0, hint: "局势平稳，可以谨慎推进。" },
    characterState: (raw.characterState && typeof raw.characterState === "object" && typeof (raw.characterState as CharacterState).hp === "object")
      ? (raw.characterState as CharacterState)
      : null
  };
}

export const useAppStore = create<AppState>((set, get) => ({
  settings: loadSettings(DEFAULT_SETTINGS),
  sessions: [],
  activeSessionId: "",
  presets: loadPresets(),
  status: { text: "待命", type: "idle" },

  init: () => {
    const loaded = loadSessions().map(normalizeSession);
    const activeId = loadActiveSessionId();
    const current = loaded.find((s) => s.localId === activeId);

    let sessions = loaded;
    let nextActive = current?.localId || "";

    if (!sessions.length) {
      const newSession: Session = {
        localId: uid(),
        backendSessionId: "",
        sourcePresetId: "",
        title: "新跑团",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [],
        luckPoints: 0,
        maxLuckPoints: 0,
        rollHistory: [],
        pressure: { level: 0, hint: "局势平稳，可以谨慎推进。" }
      };
      sessions = [newSession];
      nextActive = newSession.localId;
    } else if (!nextActive) {
      nextActive = sessions[0].localId;
    }

    saveSessions(sessions);
    saveActiveSessionId(nextActive);

    set({ sessions, activeSessionId: nextActive });
  },

  setStatus: (text, type = "idle") => set({ status: { text, type } }),

  updateSetting: (key, value) => {
    const next = { ...get().settings, [key]: value };
    saveSettings(next);
    set({ settings: next });
  },

  updateSettings: (patch) => {
    const next = { ...get().settings, ...patch };
    saveSettings(next);
    set({ settings: next });
  },

  createSession: (options) => {
    const newSession: Session = {
      localId: uid(),
      backendSessionId: "",
      sourcePresetId: options?.sourcePresetId?.trim() || "",
      title: options?.title?.trim() || "新跑团",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      luckPoints: 0,
      maxLuckPoints: 0,
      rollHistory: [],
      pressure: { level: 0, hint: "局势平稳，可以谨慎推进。" }
    };

    const sessions = [newSession, ...get().sessions];
    saveSessions(sessions);
    saveActiveSessionId(newSession.localId);
    set({ sessions, activeSessionId: newSession.localId });
    return newSession.localId;
  },

  selectSession: (id) => {
    saveActiveSessionId(id);
    set({ activeSessionId: id });
  },

  persistSessionsNow: () => {
    saveSessions(get().sessions);
  },

  clearSessionForRestart: (id) => {
    const sessions = get().sessions.map((s) =>
      s.localId === id
        ? {
            ...s,
            backendSessionId: "",
            messages: [],
            isEnded: false,
            luckPoints: 0,
            maxLuckPoints: 0,
            rollHistory: [],
            pressure: { level: 0, hint: "局势平稳，可以谨慎推进。" },
            characterState: null,
            updatedAt: Date.now()
          }
        : s
    );
    saveSessions(sessions);
    set({ sessions });
  },

  setSessionBackendId: (id, backendId) => {
    const sessions = get().sessions.map((s) =>
      s.localId === id ? { ...s, backendSessionId: backendId, updatedAt: Date.now() } : s
    );
    saveSessions(sessions);
    set({ sessions });
  },

  updateSessionTitle: (id, title) => {
    const sessions = get().sessions.map((s) =>
      s.localId === id ? { ...s, title: title || s.title, updatedAt: Date.now() } : s
    );
    saveSessions(sessions);
    set({ sessions });
  },

  markSessionEnded: (id) => {
    const sessions = get().sessions.map((s) =>
      s.localId === id ? { ...s, isEnded: true, updatedAt: Date.now() } : s
    );
    saveSessions(sessions);
    set({ sessions });
  },

  addMessage: (sessionId, role, content) => {
    const messageId = uid();
    const sessions = get().sessions.map((s) => {
      if (s.localId !== sessionId) return s;
      return {
        ...s,
        updatedAt: Date.now(),
        messages: [...s.messages, { id: messageId, role, content }]
      };
    });
    saveSessions(sessions);
    set({ sessions });
    return messageId;
  },

  appendToMessage: (sessionId, messageId, chunk) => {
    const sessions = get().sessions.map((s) => {
      if (s.localId !== sessionId) return s;
      return {
        ...s,
        updatedAt: Date.now(),
        messages: s.messages.map((m) => (m.id === messageId ? { ...m, content: m.content + chunk } : m))
      };
    });
    // Batch update without persisting on every chunk
    set({ sessions });
  },

  replaceLastAssistantMessage: (sessionId, content) => {
    const sessions = get().sessions.map((s) => {
      if (s.localId !== sessionId) return s;
      const messages = [...s.messages];
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === "assistant") {
          messages[i] = { ...messages[i], content };
          break;
        }
      }
      return { ...s, messages, updatedAt: Date.now() };
    });
    saveSessions(sessions);
    set({ sessions });
  },

  syncSessionRuntime: (id, patch) => {
    const sessions = get().sessions.map((s) =>
      s.localId === id ? { ...s, ...patch, updatedAt: Date.now() } : s
    );
    saveSessions(sessions);
    set({ sessions });
  },

  addRollRecord: (id, record) => {
    const sessions = get().sessions.map((s) => {
      if (s.localId !== id) return s;
      const history = [...(s.rollHistory || []), record].slice(-100);
      return { ...s, rollHistory: history, updatedAt: Date.now() };
    });
    saveSessions(sessions);
    set({ sessions });
  },

  spendLuck: (id, amount = 1) => {
    const sessions = get().sessions.map((s) => {
      if (s.localId !== id) return s;
      const current = s.luckPoints ?? 0;
      return { ...s, luckPoints: Math.max(0, current - amount), updatedAt: Date.now() };
    });
    saveSessions(sessions);
    set({ sessions });
  },

  savePreset: (name, data) => {
    const trimmed = name.trim();
    if (!trimmed) return { ok: false, message: "请输入预设名称。" };

    try {
      const presets = [...get().presets];
      const existing = presets.find((p) => p.name === trimmed);

      if (existing) {
        existing.data = data;
        existing.updatedAt = Date.now();
      } else {
        presets.unshift({ id: uid(), name: trimmed, updatedAt: Date.now(), data });
      }

      savePresets(presets);
      set({ presets });
      return { ok: true, message: `预设已保存：${trimmed}` };
    } catch (error) {
      const msg = String((error as Error).message || error);
      if (/quota|storage/i.test(msg)) {
        return { ok: false, message: "保存失败：浏览器本地存储空间不足，请清理旧会话后重试。" };
      }
      return { ok: false, message: `保存失败：${msg}` };
    }
  },

  loadPresetById: (id) => get().presets.find((p) => p.id === id) || null,

  deletePresetById: (id) => {
    const target = get().presets.find((p) => p.id === id);
    if (!target) return { ok: false, message: "未找到可删除预设。" };

    const presets = get().presets.filter((p) => p.id !== id);
    savePresets(presets);
    set({ presets });
    return { ok: true, message: `预设已删除：${target.name}` };
  }
}));
