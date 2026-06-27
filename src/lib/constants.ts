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

/** Cache size limits */
export const CACHE_LIMITS = {
  PARSED_CONTENT: 100,
  RECENT_SESSIONS: 50,
  DIAGNOSTICS: 300,
} as const;

/** Timeouts in milliseconds */
export const TIMEOUTS = {
  DEBOUNCE_INPUT: 300,
  DEBOUNCE_SEARCH: 500,
  THROTTLE_SCROLL: 100,
  THROTTLE_RESIZE: 200,
  LLM_REQUEST: 120000, // 2 minutes
  CACHE_CLEANUP: 60000, // 1 minute
  SESSION_TTL: 21600000, // 6 hours
} as const;

/** UI limits */
export const UI_LIMITS = {
  MAX_TITLE_LENGTH: 40,
  MAX_INPUT_HEIGHT: 200,
  MAX_QUICK_OPTIONS: 5,
  MAX_SESSION_MESSAGES: 42,
  MAX_DIAGNOSTICS: 300,
} as const;

/** Status messages */
export const STATUS_MESSAGES = {
  CONNECTION_ERROR: "无法连接到后端服务，请检查后端是否已启动 (Port 3157)。",
  RESPONSE_INCOMPLETE: "连接中断：模型响应未完整结束。请检查网络或接口服务。",
  SESSION_EXPIRED: "会话已过期（长时间无操作），请重新开始。",
  EMPTY_RESPONSE: "LLM 返回内容为空，请检查模型与接口兼容性。",
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
  gmPrompt: DEFAULT_GM_PROMPT,
  initialLuckPoints: "3",
  // D&D 5e 默认属性（全能型冒险者）
  attrStr: "12",
  attrDex: "14",
  attrCon: "13",
  attrInt: "11",
  attrWis: "12",
  attrCha: "10",
  baseHp: "20",
  baseAc: "12",
  corruptionName: "腐化",
  corruptionMax: "100",
  corruptionThreshold: "70",
  initialResources: []
};
