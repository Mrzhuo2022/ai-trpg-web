import { DEFAULT_GM_PROMPT } from "../../shared/gmPrompt.js";
import type { Settings } from "../types";

export { DEFAULT_GM_PROMPT };

export const STORAGE_KEYS = {
  settings: "trpg_settings_react_v1",
  sessions: "trpg_sessions_react_v1",
  activeSession: "trpg_active_session_react_v1",
  presets: "trpg_scene_presets_react_v1",
  presetSeedVersion: "trpg_preset_seed_version_v1"
} as const;

export const DEFAULT_SETTINGS: Settings = {
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4o-mini",
  ruleset: "D&D 5e 风格检定",
  worldName: "核冬天后的港口城",
  characterName: "林岚",
  characterProfile: "前急救员，擅长处理伤口，害怕封闭空间。",
  worldbook:
    "核冬天后第12年，港口城被三股势力割据：黑潮帮、残火教团、港务委员会。城区长期停电，地下换气系统残破，地铁站成为临时集市与黑市。",
  scenarioScript:
    "今晚你收到匿名电码：'3号码头冷库有活体样本，明晨前必须转移。' 你需要在暴风雪来临前决定盟友、路线和是否公开真相。",
  gmPrompt: DEFAULT_GM_PROMPT
};
