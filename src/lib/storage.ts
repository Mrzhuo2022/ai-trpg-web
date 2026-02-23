import { STORAGE_KEYS } from "./constants";
import { BUILTIN_PRESETS } from "./defaultPresets";
import { safeParse } from "./utils";
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
  return { ...defaultValue, ...safeParse<Partial<Settings>>(localStorage.getItem(STORAGE_KEYS.settings), {}) };
}

export function saveSettings(settings: Settings) {
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
}

export function loadSessions(): Session[] {
  return safeParse<Session[]>(localStorage.getItem(STORAGE_KEYS.sessions), []);
}

export function saveSessions(sessions: Session[]) {
  localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify(sessions));
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
