import { memo } from "react";
import type { CheckDamage, CheckQuality, StreamMetaView } from "../types";

export interface CheckCardProps {
  /** 判定结果数据 */
  meta: StreamMetaView;
  /** 是否可重投（失败 + 有运气） */
  canReroll: boolean;
  /** 是否可重写叙事 */
  canRegenerate: boolean;
  /** 是否正在请求中（禁用按钮） */
  busy: boolean;
  /** 剩余运气点 */
  luckPoints: number;
  onReroll: (originalRoll: number) => void;
  onRegenerate: () => void;
}

const QUALITY_TONE: Record<CheckQuality, { tone: string; icon: string }> = {
  crit_success: { tone: "crit-success", icon: "✦" },
  crit_fail: { tone: "crit-fail", icon: "✕" },
  great_success: { tone: "success", icon: "✓" },
  great_fail: { tone: "fail", icon: "✕" },
  success: { tone: "success", icon: "✓" },
  fail: { tone: "fail", icon: "✕" }
};

const CONDITION_LABELS: Record<string, string> = {
  downed: "倒地",
  corrupted: "腐化失控",
  bleeding: "流血",
  exposed: "暴露",
  sprained: "扭伤",
  infected: "感染",
  poisoned: "中毒",
  frightened: "恐慌",
  hidden: "隐身"
};

/**
 * 判定结果卡片：完整公式展示 + 代价 + 重投/重写操作
 * 插入叙事流中，作为该回合判定的视觉锚点
 */
export const CheckCard = memo(function CheckCard({
  meta,
  canReroll,
  canRegenerate,
  busy,
  luckPoints,
  onReroll,
  onRegenerate
}: CheckCardProps) {
  const roll = meta.roll;
  const dc = meta.dc;
  const modifier = meta.modifier;
  const total = meta.total;
  const quality = meta.quality;
  const success = meta.success;
  const attributeAbbr = meta.attributeAbbr;
  const damage: CheckDamage | undefined = meta.damage;
  const isReroll = meta.isReroll;

  if (typeof roll !== "number" || typeof dc !== "number" || !quality) return null;

  const tone = QUALITY_TONE[quality];
  const modStr = typeof modifier === "number" && modifier !== 0
    ? ` ${modifier >= 0 ? "+" : ""}${modifier}${attributeAbbr ? `(${attributeAbbr})` : ""}`
    : "";
  const totalStr = typeof total === "number" ? total : roll;

  return (
    <div className={`check-card check-card--${tone.tone}`}>
      <div className="check-card-head">
        <span className="check-card-icon" aria-hidden>{tone.icon}</span>
        <div className="check-card-formula">
          <span className="check-card-roll">d20={roll}</span>
          {modStr ? <span className="check-card-mod">{modStr}</span> : null}
          <span className="check-card-eq">=</span>
          <span className="check-card-total">{totalStr}</span>
          <span className="check-card-vs">vs DC{dc}</span>
        </div>
        <span className={`check-card-result ${success ? "is-success" : "is-fail"}`}>
          {success ? "成功" : "失败"}
        </span>
      </div>

      <div className="check-card-meta">
        {meta.categoryLabel ? <span className="check-card-tag">{meta.categoryLabel}</span> : null}
        {meta.attributeLabel ? <span className="check-card-tag">{meta.attributeLabel}检定</span> : null}
        {meta.difficulty ? <span className="check-card-tag">{meta.difficulty}</span> : null}
        {isReroll ? <span className="check-card-tag check-card-tag--reroll">⟲ 重投</span> : null}
      </div>

      {damage ? (
        <div className="check-card-damage">
          {damage.hp > 0 ? (
            <span className="dmg-chip dmg-chip--hp">HP −{damage.hp}</span>
          ) : null}
          {damage.corruption > 0 ? (
            <span className="dmg-chip dmg-chip--corr">腐化 +{damage.corruption}</span>
          ) : null}
          {damage.corruption < 0 ? (
            <span className="dmg-chip dmg-chip--heal">腐化 −{-damage.corruption}</span>
          ) : null}
          {damage.condition ? (
            <span className="dmg-chip dmg-chip--cond">{CONDITION_LABELS[damage.condition] || damage.condition}</span>
          ) : null}
          {!damage.hp && !damage.corruption && !damage.condition ? (
            <span className="dmg-chip dmg-chip--none">无代价</span>
          ) : null}
        </div>
      ) : null}

      {meta.stateAfter ? (
        <div className="check-card-state">
          <span className="state-mini">
            HP {meta.stateAfter.hp.current}/{meta.stateAfter.hp.max}
            {meta.stateAfter.hp.temp ? `(+${meta.stateAfter.hp.temp})` : ""}
          </span>
          <span className="state-mini state-mini--corr">
            {meta.stateAfter.corruption.name} {meta.stateAfter.corruption.current}/{meta.stateAfter.corruption.max}
          </span>
          {meta.stateAfter.conditions.length ? (
            <span className="state-mini state-mini--cond">
              {meta.stateAfter.conditions.map((c) => CONDITION_LABELS[c] || c).join("、")}
            </span>
          ) : null}
        </div>
      ) : null}

      {(canReroll || canRegenerate) && !busy ? (
        <div className="check-card-actions">
          {canReroll ? (
            <button
              className="check-action check-action--reroll"
              onClick={() => onReroll(roll)}
              title={`消耗 1 点运气重投（剩 ${luckPoints} 点）`}
            >
              ⟲ 重投（剩 {luckPoints}）
            </button>
          ) : null}
          {canRegenerate ? (
            <button
              className="check-action check-action--rewrite"
              onClick={onRegenerate}
              title="重新生成本回合叙事（不消耗运气）"
            >
              ↻ 重写
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
});
