import type { LorePayload, Settings } from "../types";

export interface CareerOption {
  name: string;
  summary: string;
}

export function sessionTitleFromSettings(settings: Settings) {
  return `${settings.characterName || "角色"} · ${settings.worldName || "世界"}`.slice(0, 40);
}

export function patchFromLore(payload: Partial<LorePayload>): Partial<Settings> {
  const patch: Partial<Settings> = {};
  if (typeof payload.worldName === "string") patch.worldName = payload.worldName;
  if (typeof payload.ruleset === "string") patch.ruleset = payload.ruleset;
  if (typeof payload.characterName === "string") patch.characterName = payload.characterName;
  if (typeof payload.characterProfile === "string") patch.characterProfile = payload.characterProfile;
  if (typeof payload.worldbook === "string") patch.worldbook = payload.worldbook;
  if (typeof payload.scenarioScript === "string") patch.scenarioScript = payload.scenarioScript;
  if (typeof payload.gmPrompt === "string") patch.gmPrompt = payload.gmPrompt;
  // D&D 5e 结构化属性
  if (typeof payload.attrStr === "string") patch.attrStr = payload.attrStr;
  if (typeof payload.attrDex === "string") patch.attrDex = payload.attrDex;
  if (typeof payload.attrCon === "string") patch.attrCon = payload.attrCon;
  if (typeof payload.attrInt === "string") patch.attrInt = payload.attrInt;
  if (typeof payload.attrWis === "string") patch.attrWis = payload.attrWis;
  if (typeof payload.attrCha === "string") patch.attrCha = payload.attrCha;
  if (typeof payload.baseHp === "string") patch.baseHp = payload.baseHp;
  if (typeof payload.baseAc === "string") patch.baseAc = payload.baseAc;
  if (typeof payload.corruptionName === "string") patch.corruptionName = payload.corruptionName;
  if (typeof payload.corruptionMax === "string") patch.corruptionMax = payload.corruptionMax;
  if (typeof payload.corruptionThreshold === "string") patch.corruptionThreshold = payload.corruptionThreshold;
  if (Array.isArray(payload.initialResources)) patch.initialResources = payload.initialResources;
  return patch;
}

export function lorePayloadFromSettings(settings: Settings): LorePayload {
  return {
    worldName: settings.worldName,
    ruleset: settings.ruleset,
    characterName: settings.characterName,
    characterProfile: settings.characterProfile,
    worldbook: settings.worldbook,
    scenarioScript: settings.scenarioScript,
    gmPrompt: settings.gmPrompt,
    attrStr: settings.attrStr,
    attrDex: settings.attrDex,
    attrCon: settings.attrCon,
    attrInt: settings.attrInt,
    attrWis: settings.attrWis,
    attrCha: settings.attrCha,
    baseHp: settings.baseHp,
    baseAc: settings.baseAc,
    corruptionName: settings.corruptionName,
    corruptionMax: settings.corruptionMax,
    corruptionThreshold: settings.corruptionThreshold,
    initialResources: settings.initialResources
  };
}

function pickString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

export function sanitizeLorePayload(payload: Partial<LorePayload>, fallback: Settings): LorePayload {
  return {
    worldName: pickString(payload.worldName, fallback.worldName),
    ruleset: pickString(payload.ruleset, fallback.ruleset),
    characterName: pickString(payload.characterName, fallback.characterName),
    characterProfile: pickString(payload.characterProfile, fallback.characterProfile),
    worldbook: pickString(payload.worldbook, fallback.worldbook),
    scenarioScript: pickString(payload.scenarioScript, fallback.scenarioScript),
    gmPrompt: pickString(payload.gmPrompt, fallback.gmPrompt),
    attrStr: pickString(payload.attrStr, fallback.attrStr),
    attrDex: pickString(payload.attrDex, fallback.attrDex),
    attrCon: pickString(payload.attrCon, fallback.attrCon),
    attrInt: pickString(payload.attrInt, fallback.attrInt),
    attrWis: pickString(payload.attrWis, fallback.attrWis),
    attrCha: pickString(payload.attrCha, fallback.attrCha),
    baseHp: pickString(payload.baseHp, fallback.baseHp),
    baseAc: pickString(payload.baseAc, fallback.baseAc),
    corruptionName: pickString(payload.corruptionName, fallback.corruptionName),
    corruptionMax: pickString(payload.corruptionMax, fallback.corruptionMax),
    corruptionThreshold: pickString(payload.corruptionThreshold, fallback.corruptionThreshold),
    initialResources: Array.isArray(payload.initialResources) ? payload.initialResources : fallback.initialResources
  };
}

export function sanitizeFileName(name: string) {
  return (name || "lore").replace(/[^\w\u4e00-\u9fa5-]+/g, "_");
}

export function stripFileExt(filename: string) {
  return filename.replace(/\.[^.]+$/, "");
}

export function previewText(text: string, max = 84) {
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) return "暂无剧情简介";
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max)}...`;
}

export function extractCareerOptionsFromProfile(profile: string): CareerOption[] {
  if (!profile) return [];
  const section = profile.match(/可选职业[：:]\s*([^\n。]+)/)?.[1];
  if (!section) return [];

  const options = section
    .split(/、/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const matched = item.match(/^([^（(]+)(?:[（(]([^）)]+)[）)])?/);
      return {
        name: (matched?.[1] || item).trim(),
        summary: (matched?.[2] || "").trim()
      };
    })
    .filter((item) => Boolean(item.name));

  const unique = new Map<string, CareerOption>();
  for (const option of options) {
    if (!unique.has(option.name)) unique.set(option.name, option);
  }
  return Array.from(unique.values()).slice(0, 8);
}

export function attachCareerToProfile(profile: string, career: string) {
  const cleaned = profile.replace(/\n?玩家职业：.*$/m, "").trimEnd();
  const line = `玩家职业：${career}`;
  if (!cleaned) return line;
  return `${cleaned}\n${line}`;
}
