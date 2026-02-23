import {
  escapeRegex,
  KNOWN_SECTION_LABELS,
  compactInline as compactInlineText,
  normalizeAssistantLayout,
  extractSectionByLabels as extractSectionBody,
  isEndingText as isEndingReplyShared,
  isLikelyActionOption,
  sanitizeOption as normalizeOptionLine,
  extractActionOptionsFromLines
} from "../shared/parsing.js";

function dedupeOptions(options) {
  return Array.from(new Set(options.map((option) => normalizeOptionLine(option)).filter(isLikelyActionOption))).slice(0, 5);
}

function extractOptionsFromSection(sectionText) {
  if (!sectionText) return [];
  const lines = normalizeAssistantLayout(sectionText)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const options = [];
  for (const line of lines) {
    const numbered = line.match(/^\d+[\.、)]\s*(.+)$/);
    if (numbered?.[1]) {
      options.push(numbered[1]);
      continue;
    }

    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (bullet?.[1]) {
      options.push(bullet[1]);
      continue;
    }

    options.push(line);
  }

  return dedupeOptions(options);
}

function extractFallbackOptions(text) {
  if (!text) return [];
  const lines = normalizeAssistantLayout(text)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => /^\d+[\.、)]\s+/.test(line) || /^[-*]\s+/.test(line));

  return dedupeOptions(lines);
}

function extractCheckSummary(text) {
  const normalizedText = normalizeAssistantLayout(text);
  const section = extractSectionBody(normalizedText, ["判定", "检定", "难度", "挑战"]);
  if (section) return compactInlineText(section).slice(0, 240);

  const fallback = (normalizedText || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .find((line) => /(dc\s*\d+|d20|检定|判定|豁免|掷骰|难度)/i.test(line));
  return compactInlineText(fallback || "").slice(0, 240);
}

function extractStatusSummary(text) {
  const normalizedText = normalizeAssistantLayout(text);
  const section = extractSectionBody(normalizedText, ["状态摘要", "当前状态", "状态"]);
  if (section) return compactInlineText(section).slice(0, 240);

  const fallback = (normalizedText || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .find((line) => /(当前状态|资源|生命|hp|san|理智|伤势|时间|位置|线索)/i.test(line));
  return compactInlineText(fallback || "").slice(0, 240);
}

export function hasActionOptions(text) {
  if (!text) return false;
  const normalizedText = normalizeAssistantLayout(text);
  const optionsSection = extractSectionBody(normalizedText, ["可选行动", "行动选项", "选项"]);
  if (optionsSection) {
    return extractOptionsFromSection(optionsSection).length >= 3;
  }
  const numberedCount = (normalizedText.match(/\b\d+[\.、)]/g) || []).length;
  const bulletCount = (normalizedText.match(/(?:^|\n)\s*[-*]\s+/g) || []).length;
  return numberedCount >= 3 || bulletCount >= 3;
}

export function hasCheckInfo(text) {
  if (!text) return false;
  return /【\s*(判定|检定|难度|挑战)\s*】/.test(text) || /(dc\s*\d+|d20|检定|判定|豁免|掷骰|难度)/i.test(text);
}

export function hasStatusSummary(text) {
  if (!text) return false;
  return /【\s*(状态摘要|当前状态|状态)\s*】/.test(text) || /(当前状态|资源|生命|hp|san|理智|伤势|时间|位置|线索)/i.test(text);
}

export function isEndingReply(text) {
  return isEndingReplyShared(text);
}

export function buildReplyMeta(text) {
  const safeText = normalizeAssistantLayout((text || "").trim());
  const ended = isEndingReply(safeText);

  const optionsSection = extractSectionBody(safeText, ["可选行动", "行动选项", "选项"]);
  let options = extractOptionsFromSection(optionsSection);
  if (!options.length) {
    options = extractFallbackOptions(safeText);
  }

  if (ended) {
    options = [];
  } else if (!options.length) {
    options = [
      "谨慎观察现场，锁定风险与线索。",
      "与关键人物交涉，争取更多情报。",
      "主动推进主线，承担更高风险。"
    ];
  }

  return {
    options,
    check: extractCheckSummary(safeText),
    status: extractStatusSummary(safeText),
    ended
  };
}
