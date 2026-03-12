import { useMemo, useRef, useState, useCallback, memo, useEffect } from "react";
import type { Ref } from "react";
import { parseAssistantContent, roleLabel } from "../lib/parseHelpers";
import type { AppStatus, Session, StreamMetaView } from "../types";

export interface PlayViewProps {
  activeSession: Session | null;
  status: AppStatus;
  isStarting: boolean;
  isSending: boolean;
  isCurrentRoundEnded: boolean;
  quickOptions: string[];
  latestMetaView?: StreamMetaView | null;
  chatRef: Ref<HTMLDivElement>;
  onNavigate: () => void;
  onNavigateToAdmin: () => void;
  onStartAdventure: () => void;
  onSendAction: (text: string) => void;
}

/** Cache parseAssistantContent results by content string with LRU eviction */
const parseCache = new Map<string, ReturnType<typeof parseAssistantContent>>();
const MAX_CACHE_SIZE = 100;

function cachedParse(content: string) {
  let cached = parseCache.get(content);
  if (!cached) {
    cached = parseAssistantContent(content);
    parseCache.set(content, cached);

    // LRU eviction: remove oldest entries when cache is full
    if (parseCache.size > MAX_CACHE_SIZE) {
      const firstKey = parseCache.keys().next().value;
      if (firstKey !== undefined) {
        parseCache.delete(firstKey);
      }
    }
  } else {
    // Move to end (most recently used)
    parseCache.delete(content);
    parseCache.set(content, cached);
  }
  return cached;
}

// Global cache cleanup timer (singleton)
let cacheCleanupTimer: ReturnType<typeof setInterval> | null = null;

function startCacheCleanup() {
  if (cacheCleanupTimer || typeof window === "undefined") return;
  cacheCleanupTimer = setInterval(() => {
    if (parseCache.size > MAX_CACHE_SIZE) {
      const entriesToDelete = Array.from(parseCache.keys()).slice(0, parseCache.size - MAX_CACHE_SIZE);
      entriesToDelete.forEach(key => parseCache.delete(key));
    }
  }, 60000);
}

// Start cleanup on first import
startCacheCleanup();

export const PlayView = memo(function PlayView({
  activeSession,
  status,
  isStarting,
  isSending,
  isCurrentRoundEnded,
  quickOptions,
  latestMetaView = null,
  chatRef,
  onNavigate,
  onNavigateToAdmin,
  onStartAdventure,
  onSendAction
}: PlayViewProps) {
  const [actionInput, setActionInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // metaKey: use a counter instead of Date.now() so useMemo actually works
  const metaCounter = useRef(0);
  const metaKey = useMemo(() => {
    metaCounter.current += 1;
    return `${latestMetaView?.check || ""}_${latestMetaView?.status || ""}_${metaCounter.current}`;
  }, [latestMetaView?.check, latestMetaView?.status]);

  const hasCheck = Boolean(latestMetaView?.check);
  const hasStatus = Boolean(latestMetaView?.status);
  const hasMeta = hasCheck || hasStatus;
  const showOptionsHint =
    Boolean(activeSession?.backendSessionId) && !isCurrentRoundEnded && quickOptions.length === 0 && !isSending;
  const hasChoiceContent = quickOptions.length > 0 || showOptionsHint;

  const canSend = Boolean(activeSession?.backendSessionId) && !isSending && !isCurrentRoundEnded;

  const handleSubmit = useCallback(() => {
    const text = actionInput.trim();
    if (!text || !canSend) return;
    onSendAction(text);
    setActionInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
  }, [actionInput, canSend, onSendAction]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const adjustHeight = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    setActionInput(el.value);
  }, []);

  return (
    <section className="play-zone">
      {/* ── Header ── */}
      <header className="play-header">
        <button className="header-back" onClick={onNavigate} aria-label="返回">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <div className="header-center">
          <h2 className="header-title">{activeSession?.title || "未命名章节"}</h2>
          <span className={`header-status ${status.type}`}>{status.text}</span>
        </div>
        <div className="header-actions">
          <button className="icon-btn" onClick={onNavigateToAdmin} title="设置">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </button>
          <button className="btn btn-sm" onClick={onStartAdventure} disabled={isStarting}>
            {isStarting ? "开场中…" : "重开"}
          </button>
        </div>
      </header>

      {/* ── Story Stream ── */}
      <div className="story-wrap">
        <div className="story-stream" ref={chatRef}>
          {(activeSession?.messages || []).map((msg) => {
            const av = msg.role === "assistant" ? cachedParse(msg.content) : null;
            return (
              <div key={msg.id} className={`story-msg ${msg.role}`}>
                {msg.role !== "assistant" ? (
                  <div className="story-role">{roleLabel(msg.role)}</div>
                ) : null}
                <div className="story-content">
                  {av ? av.narrative : msg.content}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Bottom Bar ── */}
      <div className="play-bottom">
        {hasMeta || hasChoiceContent ? (
          <div className="play-bottom-layout">
            {hasMeta ? (
              <section className="judge-panel">
                <div className="panel-title">判定与状态</div>
                <div className="judge-toast" key={metaKey} aria-live="polite">
                  {hasCheck ? (
                    <span className="judge-chip judge-chip--check">
                      <span className="judge-badge judge-badge--check">判定</span>
                      <span className="judge-text">{latestMetaView!.check}</span>
                    </span>
                  ) : null}
                  {hasStatus ? (
                    <span className="judge-chip judge-chip--status">
                      <span className="judge-badge judge-badge--status">状态</span>
                      <span className="judge-text">{latestMetaView!.status}</span>
                    </span>
                  ) : null}
                </div>
              </section>
            ) : null}

            {hasChoiceContent ? (
              <section className="choice-panel">
                <div className="choice-zone">
                  <div className="choice-title">可选行动</div>
                  {quickOptions.length > 0 ? (
                    <div className="choice-dock">
                      {quickOptions.map((opt, i) => (
                        <button
                          key={`${opt}-${i}`}
                          className="choice-btn"
                          disabled={isSending}
                          onClick={() => onSendAction(opt)}
                        >
                          <span className="choice-index" aria-hidden>{i + 1}</span>
                          <span className="choice-label">{opt}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="choice-hint">等待系统给出下一步可选行动…</div>
                  )}
                </div>
              </section>
            ) : null}
          </div>
        ) : null}

        {/* Composer: free text input */}
        {canSend ? (
          <div className="composer">
            <textarea
              ref={inputRef}
              className="composer-input"
              rows={1}
              placeholder="输入自定义行动…"
              value={actionInput}
              onChange={adjustHeight}
              onKeyDown={handleKeyDown}
              disabled={isSending}
              style={{ height: "auto", maxHeight: "200px" }}
            />
            <button
              className="composer-send"
              onClick={handleSubmit}
              disabled={!actionInput.trim() || isSending}
              aria-label="发送"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2Z"/></svg>
            </button>
          </div>
        ) : null}

        {/* End note */}
        {isCurrentRoundEnded ? (
          <div className="end-note">冒险已结束 · 点击「重开」开始下一段故事</div>
        ) : null}

      </div>
    </section>
  );
});

// Cleanup on page unload
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    if (cacheCleanupTimer) {
      clearInterval(cacheCleanupTimer);
      cacheCleanupTimer = null;
    }
  });
}
