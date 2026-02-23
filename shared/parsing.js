/**
 * Shared text-parsing utilities used by both server and client.
 * Keep this file as plain JS (ES modules) so Node can import it directly.
 */

export function escapeRegex(input) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const KNOWN_SECTION_LABELS = [
  "场景叙事",
  "剧情叙事",
  "当前场景",
  "场景",
  "叙事",
  "剧情",
  "故事",
  "可选行动",
  "行动选项",
  "选项",
  "判定",
  "检定",
  "难度",
  "挑战",
  "状态摘要",
  "当前状态",
  "状态",
  "结局",
  "游戏结束"
];

export function compactInline(text) {
  return (text || "").replace(/\s+/g, " ").replace(/^[-*]\s*/, "").trim();
}

export function normalizeAssistantLayout(rawText) {
  if (!rawText) return "";
  const headingPattern = KNOWN_SECTION_LABELS.map((label) => escapeRegex(label)).join("|");
  return String(rawText)
    .replace(/\r\n/g, "\n")
    .replace(new RegExp(`\\s*(【\\s*(?:${headingPattern})\\s*】)\\s*`, "g"), "\n$1\n")
    .replace(/(\d+[\.、)])(?=\S)/g, "$1 ")
    .replace(/([•·])(?=\S)/g, "$1 ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function extractSectionByLabels(text, labels) {
  if (!text || !Array.isArray(labels) || !labels.length) return "";
  const labelPattern = labels.map((v) => escapeRegex(v)).join("|");
  const headingPattern = KNOWN_SECTION_LABELS.map((v) => escapeRegex(v)).join("|");
  const pattern = new RegExp(
    `【\\s*(?:${labelPattern})\\s*】([\\s\\S]*?)(?=【\\s*(?:${headingPattern})\\s*】|$)`,
    "i"
  );
  return normalizeAssistantLayout(text).match(pattern)?.[1]?.trim() || "";
}

export function isEndingText(text) {
  if (!text) return false;
  const raw = text.toLowerCase();
  const normalized = text.replace(/\s+/g, "").toLowerCase();
  return (
    /【\s*(游戏结束|冒险结束|本章结束|剧终|完结|终章|结局)\s*】/.test(text) ||
    /the\s*end|game\s*over/.test(raw) ||
    /(到此结束|故事到这里结束|冒险告一段落|感谢游玩|谢谢游玩|本次冒险结束)/.test(normalized)
  );
}

export function isLikelyActionOption(option) {
  if (!option) return false;
  const cleaned = option.replace(/\s+/g, "").toLowerCase();
  if (cleaned.length < 2 || cleaned.length > 60) return false;

  if (
    /^(判定|检定|难度|状态|结果|说明|提示|备注|dc|d20|成功|失败|豁免|投骰)/.test(cleaned) ||
    /^(请进行|需要进行|进行一次|掷骰)/.test(cleaned)
  ) {
    return false;
  }

  if (/(dc\d+|d20|检定|判定|豁免|掷骰|成功[:：]|失败[:：])/.test(cleaned)) {
    return false;
  }

  return true;
}

export function sanitizeOption(option) {
  return (option || "")
    .replace(/^\s*\d+[\.、)]\s*/, "")
    .replace(/^\s*[-*]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractActionOptionsFromLines(lines) {
  const options = [];
  for (const line of lines) {
    const numbered = line.match(/^\d+[\.、]\s*(.+)$/);
    if (numbered?.[1]) {
      const option = numbered[1].trim();
      if (isLikelyActionOption(option)) options.push(option);
      continue;
    }

    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (bullet?.[1]) {
      const option = bullet[1].trim();
      if (isLikelyActionOption(option)) options.push(option);
      continue;
    }

    if (isLikelyActionOption(line)) {
      options.push(line);
    }
  }

  return Array.from(new Set(options)).slice(0, 5);
}
