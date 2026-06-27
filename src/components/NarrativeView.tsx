import { memo, useDeferredValue } from "react";
import { parseAssistantContent } from "../lib/parseHelpers";
import type { AssistantParsedView } from "../lib/parseHelpers";

export interface NarrativeViewProps {
  content: string;
}

/** 模块级 LRU 缓存：避免流式过程中重复解析同一段内容 */
const parseCache = new Map<string, AssistantParsedView>();
const MAX_CACHE_SIZE = 100;

function cachedParse(content: string): AssistantParsedView {
  const cached = parseCache.get(content);
  if (cached) {
    // 命中：移到末尾（最近使用）
    parseCache.delete(content);
    parseCache.set(content, cached);
    return cached;
  }
  const parsed = parseAssistantContent(content);
  parseCache.set(content, parsed);
  if (parseCache.size > MAX_CACHE_SIZE) {
    const firstKey = parseCache.keys().next().value;
    if (firstKey !== undefined) parseCache.delete(firstKey);
  }
  return parsed;
}

/**
 * 把 GM 回复解析后按语义区块渲染：叙事 / 判定 / 状态。
 * 可选行动不在这里渲染（由底部 choice-panel 渲染为按钮）。
 *
 * 叙事段落内部做轻量 Markdown-like 处理：
 * - 【小标题】→ 加粗高亮
 * - **加粗** → <strong>
 * - 连续两个换行 → 段落分隔
 */
export const NarrativeView = memo(function NarrativeView({ content }: NarrativeViewProps) {
  // useDeferredValue：流式追加 token 时，让解析与富文本渲染降级为低优先级，
  // 避免每个 token 都同步阻塞主线程。React 会在浏览器空闲时合并渲染。
  const deferredContent = useDeferredValue(content);
  const parsed = cachedParse(deferredContent);

  return (
    <div className="narrative-view">
      {parsed.narrative ? (
        <div className="narrative-body">{renderRichText(parsed.narrative)}</div>
      ) : null}

      {parsed.check ? (
        <div className="narrative-check">
          <span className="narrative-mini-badge">判定</span>
          <span>{parsed.check}</span>
        </div>
      ) : null}

      {parsed.status ? (
        <div className="narrative-status">
          <span className="narrative-mini-badge narrative-mini-badge--status">状态</span>
          <span>{parsed.status}</span>
        </div>
      ) : null}
    </div>
  );
});

/**
 * 轻量富文本渲染：
 * 1. 按【xxx】拆分，标题段加粗高亮
 * 2. **加粗** → strong
 * 3. 空行分段
 */
function renderRichText(text: string) {
  if (!text) return null;

  type Seg = { type: "text" | "heading"; value: string };
  const parts: Seg[] = [];
  const lines = text.split(/\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    // 【小标题】单独成段，高亮
    const headingMatch = trimmed.match(/^【([^】]+)】[:：]?\s*$/);
    if (headingMatch) {
      parts.push({ type: "heading", value: headingMatch[1] });
      continue;
    }
    // 纯空行 → 段落分隔
    if (!trimmed) {
      parts.push({ type: "text", value: "" });
      continue;
    }
    parts.push({ type: "text", value: line });
  }

  // 按空行分组为段落
  const paragraphs: Seg[][] = [];
  let current: Seg[] = [];
  for (const p of parts) {
    if (p.type === "text" && p.value === "") {
      if (current.length) {
        paragraphs.push(current);
        current = [];
      }
    } else {
      current.push(p);
    }
  }
  if (current.length) paragraphs.push(current);

  return paragraphs.map((para, i) => {
    // 整段都是 heading
    if (para.length === 1 && para[0].type === "heading") {
      return (
        <h4 key={i} className="narrative-heading">【{para[0].value}】</h4>
      );
    }
    // 段内可能混合 heading + text
    return (
      <p key={i} className="narrative-para">
        {para.map((seg, j) => {
          if (seg.type === "heading") {
            return <strong key={j} className="narrative-inline-heading">【{seg.value}】</strong>;
          }
          return <span key={j}>{renderBoldInline(seg.value)}</span>;
        })}
      </p>
    );
  });
}

/** 处理行内 **加粗** */
function renderBoldInline(text: string) {
  const segments = text.split(/(\*\*[^*]+\*\*)/g);
  return segments.map((seg, i) => {
    if (/^\*\*[^*]+\*\*$/.test(seg)) {
      return <strong key={i} className="narrative-bold">{seg.slice(2, -2)}</strong>;
    }
    // 保留行内换行
    if (seg.includes("\n")) {
      return seg.split("\n").map((line, k, arr) => (
        <span key={`${i}-${k}`}>
          {line}
          {k < arr.length - 1 ? <br /> : null}
        </span>
      ));
    }
    return <span key={i}>{seg}</span>;
  });
}
