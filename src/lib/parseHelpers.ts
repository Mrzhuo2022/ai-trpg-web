import {
  compactInline,
  normalizeAssistantLayout,
  extractSectionByLabels,
  isEndingText as isEndingTextShared,
  sanitizeOption,
  extractActionOptionsFromLines
} from "../../shared/parsing.js";

export type AssistantSectionKey = "narrative" | "options" | "check" | "status" | "other";

export interface AssistantParsedView {
  narrative: string;
  check: string;
  status: string;
  options: string[];
}

export interface GMReplyMeta {
  options: string[];
  check: string;
  status: string;
  ended: boolean;
}

const META_BLOCK_REGEX = /<GM_META>\s*([\s\S]*?)\s*<\/GM_META>/g;

export function roleLabel(role: string) {
  if (role === "assistant") return "主持人";
  if (role === "user") return "你";
  if (role === "system") return "系统";
  if (role === "error") return "错误";
  return role;
}

function normalizeMeta(raw: unknown): GMReplyMeta | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const optionsRaw = Array.isArray(obj.options) ? obj.options : [];
  const options = Array.from(
    new Set(
      optionsRaw
        .map((item) => sanitizeOption(typeof item === "string" ? item : ""))
        .filter((item) => item.length >= 2 && item.length <= 60)
    )
  ).slice(0, 5);

  const check = typeof obj.check === "string" ? obj.check.replace(/\s+/g, " ").trim().slice(0, 240) : "";
  const status = typeof obj.status === "string" ? obj.status.replace(/\s+/g, " ").trim().slice(0, 240) : "";
  const ended = Boolean(obj.ended);

  return {
    options: ended ? [] : options,
    check,
    status,
    ended
  };
}

export function extractEmbeddedMeta(rawText: string): GMReplyMeta | null {
  if (!rawText) return null;
  const matches = Array.from(rawText.matchAll(META_BLOCK_REGEX));
  if (!matches.length) return null;

  const latestBlock = matches[matches.length - 1]?.[1];
  if (!latestBlock) return null;

  try {
    return normalizeMeta(JSON.parse(latestBlock));
  } catch {
    return null;
  }
}

export function stripEmbeddedMeta(rawText: string): string {
  if (!rawText) return "";
  return rawText.replace(META_BLOCK_REGEX, "").trim();
}

export function isEndingText(text: string): boolean {
  if (!text) return false;
  const embedded = extractEmbeddedMeta(text);
  if (embedded?.ended) return true;
  return isEndingTextShared(stripEmbeddedMeta(text));
}

export { extractActionOptionsFromLines } from "../../shared/parsing.js";

export function extractActionOptions(text: string): string[] {
  if (!text) return [];
  const cleanText = normalizeAssistantLayout(stripEmbeddedMeta(text));
  const section = extractSectionByLabels(cleanText, ["可选行动", "行动选项", "选项"]);
  if (!section) return [];
  const lines = section
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  return extractActionOptionsFromLines(lines);
}

function normalizeSectionLabel(raw: string): AssistantSectionKey | null {
  const label = raw.replace(/[【】:：\s]/g, "").toLowerCase();
  if (!label) return null;

  if (/可选行动|行动选项|选项|actions?/.test(label)) return "options";
  if (/判定|检定|难度|挑战/.test(label)) return "check";
  if (/状态摘要|当前状态|状态/.test(label)) return "status";
  if (/场景叙事|剧情叙事|当前场景|场景|叙事|剧情|故事/.test(label)) return "narrative";

  return null;
}

function detectSectionHeading(line: string): AssistantSectionKey | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const bracket = trimmed.match(/^【([^】]+)】[:：]?$/);
  if (bracket?.[1]) {
    return normalizeSectionLabel(bracket[1]);
  }

  const colonHeading = trimmed.match(/^(?:\d+[\.、)]\s*|[一二三四五六七八九十]+[、.)]\s*)?([^：:]{1,20})[：:]$/);
  if (colonHeading?.[1]) {
    return normalizeSectionLabel(colonHeading[1]);
  }

  if (trimmed.length <= 8) {
    return normalizeSectionLabel(trimmed);
  }

  return null;
}

export function parseAssistantContent(rawText: string): AssistantParsedView {
  const textWithMeta = rawText || "";
  const embeddedMeta = extractEmbeddedMeta(textWithMeta);
  const text = normalizeAssistantLayout(stripEmbeddedMeta(textWithMeta));
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const buckets: Record<AssistantSectionKey, string[]> = {
    narrative: [],
    options: [],
    check: [],
    status: [],
    other: []
  };

  let currentSection: AssistantSectionKey = "narrative";
  for (const line of lines) {
    const heading = detectSectionHeading(line);
    if (heading) {
      currentSection = heading;
      continue;
    }
    buckets[currentSection].push(line);
  }

  let narrative =
    extractSectionByLabels(text, ["场景叙事", "剧情叙事", "当前场景", "场景", "叙事", "剧情", "故事"]) ||
    buckets.narrative.join("\n").trim();
  if (!narrative) {
    const beforeOptions = text.split(/【\s*可选行动\s*】|【\s*行动选项\s*】|可选行动[:：]/)[0]?.trim();
    if (beforeOptions) narrative = beforeOptions;
  }
  if (!narrative) {
    narrative = lines
      .filter((line) => !/^\d+[\.、]\s+/.test(line))
      .slice(0, 6)
      .join("\n")
      .trim();
  }

  const textDerivedOptions = (() => {
    const fromSection = extractSectionByLabels(text, ["可选行动", "行动选项", "选项"]);
    if (fromSection) {
      const lines = fromSection
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean);
      const options = extractActionOptionsFromLines(lines);
      if (options.length) return options;
    }
    const options = extractActionOptionsFromLines(buckets.options);
    if (options.length) return options;
    return extractActionOptions(text);
  })();

  const options = embeddedMeta?.ended ? [] : embeddedMeta?.options?.length ? embeddedMeta.options : textDerivedOptions;
  const check =
    embeddedMeta?.check ||
    compactInline(extractSectionByLabels(text, ["判定", "检定", "难度", "挑战"])) ||
    compactInline(buckets.check.join(" "));
  const status =
    embeddedMeta?.status ||
    compactInline(extractSectionByLabels(text, ["状态摘要", "当前状态", "状态"])) ||
    compactInline(buckets.status.join(" "));

  return {
    narrative: narrative || "……",
    check,
    status,
    options
  };
}
