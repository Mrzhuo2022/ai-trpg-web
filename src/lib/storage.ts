import { STORAGE_KEYS } from "./constants";
import { BUILTIN_PRESETS } from "./defaultPresets";
import { safeParse } from "./utils";
import { obfuscate, deobfuscate } from "./credential";
import type { Preset, Session, Settings } from "../types";

const PRESET_SEED_VERSION = "builtin_titanfall_v4";

function clonePreset(preset: Preset): Preset {
  return {
    ...preset,
    data: { ...preset.data }
  };
}

function applyBuiltinPresetSeed(presets: Preset[]): Preset[] {
  let next = [...presets];
  let changed = false;

  for (const builtin of BUILTIN_PRESETS) {
    const exists = next.some((item) => item.id === builtin.id || item.name === builtin.name);
    if (!exists) {
      next = [clonePreset(builtin), ...next];
      changed = true;
    }
  }

  if (changed) {
    savePresets(next);
  }

  localStorage.setItem(STORAGE_KEYS.presetSeedVersion, PRESET_SEED_VERSION);
  return next;
}

export function loadSettings(defaultValue: Settings): Settings {
  const stored = safeParse<Partial<Settings>>(localStorage.getItem(STORAGE_KEYS.settings), {});
  // 还原被混淆的 apiKey（向后兼容：旧版明文也能读）
  const apiKey = stored.apiKey ? deobfuscate(stored.apiKey) : "";
  return { ...defaultValue, ...stored, apiKey };
}

export function saveSettings(settings: Settings) {
  try {
    // apiKey 混淆存储，避免 localStorage 裸露明文
    const safe = { ...settings, apiKey: settings.apiKey ? obfuscate(settings.apiKey) : "" };
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(safe));
  } catch (err) {
    console.error("[saveSettings] 持久化失败：", err);
  }
}

export function loadSessions(): Session[] {
  return safeParse<Session[]>(localStorage.getItem(STORAGE_KEYS.sessions), []);
}

/** localStorage 单 key 的安全容量预算（字节）。多数浏览器 5MB 上限，这里保守取 2.5MB。 */
const SESSIONS_STORAGE_BUDGET = 2.5 * 1024 * 1024;
/** 裁剪时保留的最近会话数 */
const MAX_PERSISTED_SESSIONS = 12;
/** 单会话持久化的最近消息数（更早的只留系统，靠后端剧情纲要兜底） */
const MAX_PERSISTED_MESSAGES = 60;
/** 单会话持久化的掷骰记录上限 */
const MAX_PERSISTED_ROLLS = 40;

/**
 * 裁剪会话列表，使其序列化后尽量落在存储预算内。
 * 策略：保留最近活跃的若干会话；每会话只保留最近 N 条消息 + 截断掷骰历史。
 * 不改变内存中的会话（只影响持久化形态），所以活动会话的完整上下文在后端依然保留。
 */
function pruneSessionsForStorage(sessions: Session[]): Session[] {
  // 1. 按最近更新排序，保留活跃会话
  const sorted = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);
  let kept = sorted.slice(0, MAX_PERSISTED_SESSIONS).map((s) => ({
    ...s,
    messages: s.messages.slice(-MAX_PERSISTED_MESSAGES),
    rollHistory: Array.isArray(s.rollHistory) ? s.rollHistory.slice(-MAX_PERSISTED_ROLLS) : []
  }));

  // 2. 若仍超预算，逐步减少保留的会话数
  while (JSON.stringify(kept).length > SESSIONS_STORAGE_BUDGET && kept.length > 1) {
    kept = kept.slice(0, Math.max(1, Math.floor(kept.length * 0.7)));
  }

  // 3. 仍超预算（极端情况：单个会话超大），逐会话压缩消息数
  if (JSON.stringify(kept).length > SESSIONS_STORAGE_BUDGET) {
    kept = kept.map((s) => ({
      ...s,
      messages: s.messages.slice(-20),
      rollHistory: s.rollHistory.slice(-15)
    }));
  }

  return kept;
}

export function saveSessions(sessions: Session[]) {
  try {
    const pruned = pruneSessionsForStorage(sessions);
    localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify(pruned));
  } catch (err) {
    // 配额超限：做更激进的裁剪后重试一次
    try {
      const aggressive = [...sessions]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 4)
        .map((s) => ({ ...s, messages: s.messages.slice(-30), rollHistory: (s.rollHistory || []).slice(-15) }));
      localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify(aggressive));
    } catch {
      // 仍然失败：记录错误，保留旧数据，避免崩溃
      console.error("[saveSessions] 持久化失败，可能 localStorage 已满：", err);
    }
  }
}

export function loadActiveSessionId(): string {
  return localStorage.getItem(STORAGE_KEYS.activeSession) || "";
}

export function saveActiveSessionId(id: string) {
  localStorage.setItem(STORAGE_KEYS.activeSession, id);
}

export function loadPresets(): Preset[] {
  const parsed = safeParse<Preset[]>(localStorage.getItem(STORAGE_KEYS.presets), []);
  const seedVersion = localStorage.getItem(STORAGE_KEYS.presetSeedVersion);

  if (seedVersion !== PRESET_SEED_VERSION) {
    return applyBuiltinPresetSeed(parsed);
  }

  return parsed;
}

export function savePresets(presets: Preset[]) {
  localStorage.setItem(STORAGE_KEYS.presets, JSON.stringify(presets));
}
