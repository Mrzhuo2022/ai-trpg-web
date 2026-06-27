import { memo, useMemo } from "react";
import type { RollRecord } from "../types";

export interface HistoryPanelProps {
  rollHistory: RollRecord[];
  luckPoints: number;
  maxLuckPoints: number;
  onClose: () => void;
}

const QUALITY_BADGE: Record<string, { label: string; tone: string }> = {
  crit_success: { label: "大成功", tone: "crit-success" },
  crit_fail: { label: "大失败", tone: "crit-fail" },
  great_success: { label: "轻松", tone: "success" },
  great_fail: { label: "明显失败", tone: "fail" },
  success: { label: "成功", tone: "success" },
  fail: { label: "失败", tone: "fail" }
};

export const HistoryPanel = memo(function HistoryPanel({
  rollHistory,
  luckPoints,
  maxLuckPoints,
  onClose
}: HistoryPanelProps) {
  const stats = useMemo(() => {
    const total = rollHistory.length;
    if (!total) return { total: 0, success: 0, fail: 0, critSuccess: 0, critFail: 0, rate: 0 };
    const success = rollHistory.filter((r) => r.success).length;
    const fail = total - success;
    const critSuccess = rollHistory.filter((r) => r.quality === "crit_success").length;
    const critFail = rollHistory.filter((r) => r.quality === "crit_fail").length;
    return { total, success, fail, critSuccess, critFail, rate: Math.round((success / total) * 100) };
  }, [rollHistory]);

  const recent = useMemo(() => [...rollHistory].reverse().slice(0, 15), [rollHistory]);

  return (
    <div className="history-overlay" role="dialog" aria-modal="true" aria-labelledby="history-title">
      <div className="history-panel">
        <header className="history-head">
          <h3 id="history-title">本局战绩</h3>
          <button className="icon-btn" onClick={onClose} aria-label="关闭">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </header>

        <section className="history-stats">
          <div className="stat-grid">
            <div className="stat-cell">
              <span className="stat-num">{stats.total}</span>
              <span className="stat-label">总掷骰</span>
            </div>
            <div className="stat-cell stat-cell--success">
              <span className="stat-num">{stats.success}</span>
              <span className="stat-label">成功</span>
            </div>
            <div className="stat-cell stat-cell--fail">
              <span className="stat-num">{stats.fail}</span>
              <span className="stat-label">失败</span>
            </div>
            <div className="stat-cell">
              <span className="stat-num">{stats.rate}%</span>
              <span className="stat-label">成功率</span>
            </div>
          </div>
          <div className="stat-row">
            <span className="stat-pill stat-pill--gold">✦ 大成功 ×{stats.critSuccess}</span>
            <span className="stat-pill stat-pill--red">✕ 大失败 ×{stats.critFail}</span>
          </div>
          <div className="stat-row">
            <span className="luck-display">
              <span className="luck-icon"> ♦ </span>
              运气点 {luckPoints} / {maxLuckPoints}
            </span>
          </div>
        </section>

        <section className="history-list">
          <div className="history-list-title">最近判定</div>
          {recent.length === 0 ? (
            <div className="history-empty">本局尚未掷骰。</div>
          ) : (
            <ul>
              {recent.map((r) => {
                const badge = QUALITY_BADGE[r.quality] || QUALITY_BADGE.fail;
                return (
                  <li key={r.id} className={`history-item history-item--${badge.tone}`}>
                    <span className={`history-badge history-badge--${badge.tone}`}>{badge.label}</span>
                    <span className="history-dice">d{r.roll} / DC{r.dc}</span>
                    <span className="history-action">
                      {r.isReroll ? "⟲ " : ""}{r.action}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
});
