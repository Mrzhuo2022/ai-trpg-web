import { useRef, useState, useCallback, memo } from "react";
import type { Ref } from "react";
import { DiceOverlay } from "./DiceOverlay";
import { HistoryPanel } from "./HistoryPanel";
import { CheckCard } from "./CheckCard";
import { CharacterSheet } from "./CharacterSheet";
import { StoryMessage } from "./StoryMessage";
import type { AppStatus, RollRecord, Session, StreamMetaView } from "../types";

export interface PlayViewProps {
  activeSession: Session | null;
  status: AppStatus;
  isStarting: boolean;
  isSending: boolean;
  isRolling: boolean;
  isCurrentRoundEnded: boolean;
  quickOptions: string[];
  latestMetaView?: StreamMetaView | null;
  /** 本回合判定卡片是否应该显示（rolling 完成后） */
  showCheckCard: boolean;
  chatRef: Ref<HTMLDivElement>;
  /** 最近一次失败的行动文本（非空时显示重试条） */
  lastFailedAction?: string;
  onNavigate: () => void;
  onNavigateToAdmin: () => void;
  onStartAdventure: () => void;
  onSendAction: (text: string) => void;
  onReroll: (action: string) => void;
  onRegenerate: () => void;
  onCancelStream?: () => void;
}

const PRESSURE_META: Record<number, { label: string; tone: string }> = {
  0: { label: "平稳", tone: "calm" },
  1: { label: "紧张", tone: "tense" },
  2: { label: "危急", tone: "critical" },
  3: { label: "绝境", tone: "dire" }
};

export const PlayView = memo(function PlayView({
  activeSession,
  status,
  isStarting,
  isSending,
  isRolling,
  isCurrentRoundEnded,
  quickOptions,
  latestMetaView = null,
  showCheckCard,
  chatRef,
  lastFailedAction = "",
  onNavigate,
  onNavigateToAdmin,
  onStartAdventure,
  onSendAction,
  onReroll,
  onRegenerate,
  onCancelStream
}: PlayViewProps) {
  const [actionInput, setActionInput] = useState("");
  const [inputExpanded, setInputExpanded] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showSheet, setShowSheet] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const canSend = Boolean(activeSession?.backendSessionId) && !isSending && !isCurrentRoundEnded && !isRolling;
  const isStreamActive = isSending || isStarting;
  const showOptionsHint =
    Boolean(activeSession?.backendSessionId) && !isCurrentRoundEnded && quickOptions.length === 0 && !isSending;

  const luckPoints = latestMetaView?.luckPoints ?? activeSession?.luckPoints ?? 0;
  const maxLuckPoints = latestMetaView?.maxLuckPoints ?? activeSession?.maxLuckPoints ?? 0;
  const pressure = latestMetaView?.pressure ?? activeSession?.pressure ?? { level: 0, hint: "局势平稳，可以谨慎推进。" };
  const characterState = latestMetaView?.characterState ?? activeSession?.characterState ?? null;
  const rollHistory: RollRecord[] = activeSession?.rollHistory || [];
  const pressureMeta = PRESSURE_META[pressure.level] || PRESSURE_META[0];

  // HP 概要（header 小条用）
  const hpPct = characterState ? Math.max(0, Math.min(100, (characterState.hp.current / characterState.hp.max) * 100)) : 0;
  const isDowned = characterState?.conditions.includes("downed");

  // 可重投/重写条件
  const canReroll = Boolean(
    latestMetaView?.canReroll && !isSending && !isCurrentRoundEnded &&
    typeof latestMetaView?.roll === "number" && luckPoints > 0
  );
  const canRegenerate = Boolean(activeSession?.backendSessionId) && !isSending && !isCurrentRoundEnded && !isRolling;

  const handleSubmit = useCallback(() => {
    const text = actionInput.trim();
    if (!text || !canSend) return;
    onSendAction(text);
    setActionInput("");
    setInputExpanded(false);
    if (inputRef.current) inputRef.current.style.height = "auto";
  }, [actionInput, canSend, onSendAction]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // 中文/日文输入法组词中按 Enter 是确认候选词，不应发送
      if (e.nativeEvent.isComposing) return;
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

  const handleReroll = useCallback(() => {
    const lastRoll = rollHistory[rollHistory.length - 1];
    onReroll(lastRoll?.action || "");
  }, [rollHistory, onReroll]);

  return (
    <section className="play-zone">
      {/* 掷骰动画浮层 */}
      <DiceOverlay
        active={typeof latestMetaView?.roll === "number"}
        roll={latestMetaView?.roll}
        modifier={latestMetaView?.modifier}
        attributeAbbr={latestMetaView?.attributeAbbr}
        attributeLabel={latestMetaView?.attributeLabel}
        total={latestMetaView?.total}
        dc={latestMetaView?.dc}
        quality={latestMetaView?.quality}
        isReroll={latestMetaView?.isReroll}
      />

      {/* 角色状态抽屉 */}
      {showSheet ? (
        <CharacterSheet
          characterState={characterState}
          pressure={pressure}
          luckPoints={luckPoints}
          maxLuckPoints={maxLuckPoints}
          rollHistory={rollHistory}
          onClose={() => setShowSheet(false)}
        />
      ) : null}

      {/* 战绩面板 */}
      {showHistory ? (
        <HistoryPanel
          rollHistory={rollHistory}
          luckPoints={luckPoints}
          maxLuckPoints={maxLuckPoints}
          onClose={() => setShowHistory(false)}
        />
      ) : null}

      {/* ── 极简 Header ── */}
      <header className="play-header">
        <button className="header-back" onClick={onNavigate} aria-label="返回">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <div className="header-center">
          <h2 className="header-title">{activeSession?.title || "未命名章节"}</h2>
          <span className={`header-status ${status.type}`}>{status.text}</span>
        </div>
        <div className="header-actions">
          {/* HP 小条（极简，点击展开抽屉） */}
          {characterState ? (
            <button
              className={`hp-pill ${isDowned ? "is-downed" : ""} ${hpPct < 25 ? "is-low" : ""}`}
              onClick={() => setShowSheet(true)}
              title={`HP ${characterState.hp.current}/${characterState.hp.max} · AC ${characterState.ac}`}
            >
              <span className="hp-pill-bar"><span className="hp-pill-fill" style={{ width: `${hpPct}%` }} /></span>
              <span className="hp-pill-num">{characterState.hp.current}</span>
            </button>
          ) : null}
          {/* 局势标签 */}
          <span className={`pressure-tag pressure-tag--${pressureMeta.tone}`} title={pressure.hint}>
            {pressureMeta.label}
          </span>
          {/* 运气 */}
          <span className="luck-tag" title="运气点">♦{luckPoints}</span>
          {/* 状态抽屉按钮 */}
          <button className="icon-btn" onClick={() => setShowSheet(true)} title="角色状态" aria-label="角色状态">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          </button>
          {/* 战绩按钮 */}
          <button className="icon-btn" onClick={() => setShowHistory(true)} title="战绩" aria-label="战绩">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          </button>
          {/* 设置 */}
          <button className="icon-btn" onClick={onNavigateToAdmin} title="设置">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </button>
          <button className="btn btn-sm" onClick={onStartAdventure} disabled={isStarting}>
            {isStarting ? "开场中…" : "重开"}
          </button>
        </div>
      </header>

      {/* ── 叙事流（占满主屏） ── */}
      <div className="story-wrap">
        <div className="story-stream" ref={chatRef}>
          {(activeSession?.messages || []).map((msg) => (
            <StoryMessage key={msg.id} id={msg.id} role={msg.role} content={msg.content} />
          ))}

          {/* 判定结果卡片（插入叙事流末尾，不占底部空间） */}
          {showCheckCard && latestMetaView && typeof latestMetaView.roll === "number" && latestMetaView.quality ? (
            <div className="story-msg story-msg--check">
              <CheckCard
                meta={latestMetaView}
                canReroll={canReroll}
                canRegenerate={canRegenerate}
                busy={isSending}
                luckPoints={luckPoints}
                onReroll={handleReroll}
                onRegenerate={onRegenerate}
              />
            </div>
          ) : null}
        </div>
      </div>

      {/* ── 极简底部：快捷行动 + 输入 ── */}
      <div className="play-bottom">
        {/* 失败重试条 */}
        {lastFailedAction && canSend ? (
          <div className="retry-bar">
            <span className="retry-bar-text">上次行动发送失败</span>
            <button className="btn btn-sm" onClick={() => onSendAction(lastFailedAction)}>
              重试「{lastFailedAction.slice(0, 20)}{lastFailedAction.length > 20 ? "…" : ""}」
            </button>
          </div>
        ) : null}

        {/* 快捷行动芯片（横向） */}
        {!isCurrentRoundEnded && (quickOptions.length > 0 || showOptionsHint) ? (
          <div className="quick-actions">
            {quickOptions.length > 0 ? (
              quickOptions.map((opt, i) => (
                <button
                  key={`${opt}-${i}`}
                  className="quick-chip"
                  disabled={isSending}
                  onClick={() => onSendAction(opt)}
                >
                  <span className="quick-chip-idx">{i + 1}</span>
                  <span className="quick-chip-text">{opt}</span>
                </button>
              ))
            ) : (
              <span className="quick-hint">等待系统给出下一步可选行动…</span>
            )}
          </div>
        ) : null}

        {/* 输入框：发送期间保持渲染（disabled），避免底栏跳变；用户可预输入下一步 */}
        {Boolean(activeSession?.backendSessionId) && !isCurrentRoundEnded ? (
          <div className={`composer ${inputExpanded ? "is-expanded" : ""}`}>
            <textarea
              ref={inputRef}
              className="composer-input"
              rows={1}
              placeholder={isSending ? "回应生成中…" : "输入自定义行动…"}
              value={actionInput}
              onChange={adjustHeight}
              onKeyDown={handleKeyDown}
              onFocus={() => setInputExpanded(true)}
              style={{ height: "auto", maxHeight: "200px" }}
            />
            {isStreamActive && onCancelStream ? (
              <button
                className="composer-send composer-stop"
                onClick={onCancelStream}
                title="停止生成"
                aria-label="停止生成"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="7" y="7" width="10" height="10" rx="1.5"/></svg>
              </button>
            ) : (
              <button
                className="composer-send"
                onClick={handleSubmit}
                disabled={!actionInput.trim() || !canSend}
                aria-label="发送"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2Z"/></svg>
              </button>
            )}
          </div>
        ) : null}

        {isCurrentRoundEnded ? (
          <div className="end-note">冒险已结束 · 点击「重开」开始下一段故事</div>
        ) : null}
      </div>
    </section>
  );
});
