import { memo } from "react";
import type { CharacterState, Pressure, RollRecord } from "../types";

export interface CharacterSheetProps {
  characterState: CharacterState | null;
  pressure: Pressure;
  luckPoints: number;
  maxLuckPoints: number;
  rollHistory: RollRecord[];
  onClose: () => void;
}

const ATTRIBUTE_ROWS: Array<{ key: keyof CharacterState["attributes"]; abbr: string; label: string }> = [
  { key: "str", abbr: "STR", label: "力量" },
  { key: "dex", abbr: "DEX", label: "敏捷" },
  { key: "con", abbr: "CON", label: "体质" },
  { key: "int", abbr: "INT", label: "智力" },
  { key: "wis", abbr: "WIS", label: "感知" },
  { key: "cha", abbr: "CHA", label: "魅力" }
];

function abilityModifier(value: number): number {
  return Math.floor((Math.max(1, Math.min(30, value)) - 10) / 2);
}

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

const PRESSURE_META: Record<number, { label: string; tone: string }> = {
  0: { label: "平稳", tone: "calm" },
  1: { label: "紧张", tone: "tense" },
  2: { label: "危急", tone: "critical" },
  3: { label: "绝境", tone: "dire" }
};

export const CharacterSheet = memo(function CharacterSheet({
  characterState,
  pressure,
  luckPoints,
  maxLuckPoints,
  rollHistory,
  onClose
}: CharacterSheetProps) {
  const hpPct = characterState ? Math.max(0, Math.min(100, (characterState.hp.current / characterState.hp.max) * 100)) : 0;
  const hpTempPct = characterState && characterState.hp.temp > 0
    ? Math.min(100 - hpPct, (characterState.hp.temp / characterState.hp.max) * 100)
    : 0;
  const corrPct = characterState ? Math.max(0, Math.min(100, (characterState.corruption.current / characterState.corruption.max) * 100)) : 0;
  const corrOver = characterState ? characterState.corruption.current >= characterState.corruption.threshold : false;
  const pressureMeta = PRESSURE_META[pressure.level] || PRESSURE_META[0];

  const recentRolls = [...rollHistory].reverse().slice(0, 8);

  return (
    <>
      <div className="sheet-mask" onClick={onClose} aria-hidden />
      <aside className="character-sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
        <header className="sheet-head">
          <h3 id="sheet-title">角色状态</h3>
          <button className="icon-btn" onClick={onClose} aria-label="关闭">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </header>

        <div className="sheet-body">
          {!characterState ? (
            <div className="sheet-empty">尚未开局，无角色数据。</div>
          ) : (
            <>
              {/* HP 条 */}
              <section className="sheet-section">
                <div className="sheet-bar-label">
                  <span>HP</span>
                  <span className="sheet-bar-value">
                    {characterState.hp.current}{characterState.hp.temp ? ` (+${characterState.hp.temp})` : ""} / {characterState.hp.max}
                  </span>
                </div>
                <div className="sheet-bar">
                  <div className={`sheet-bar-fill sheet-bar-fill--hp ${hpPct < 25 ? "is-low" : ""}`} style={{ width: `${hpPct}%` }} />
                  {hpTempPct > 0 ? (
                    <div className="sheet-bar-fill sheet-bar-fill--hp-temp" style={{ width: `${hpTempPct}%` }} />
                  ) : null}
                </div>
                <div className="sheet-stat-row">
                  <span className="sheet-stat">AC {characterState.ac}</span>
                  <span className="sheet-stat">等级 {characterState.level}</span>
                  {characterState.conditions.length > 0 ? (
                    <span className="sheet-stat sheet-stat--warn">
                      {characterState.conditions.map((c) => CONDITION_LABELS[c] || c).join("、")}
                    </span>
                  ) : null}
                </div>
              </section>

              {/* 腐化/理智条 */}
              <section className="sheet-section">
                <div className="sheet-bar-label">
                  <span>{characterState.corruption.name}</span>
                  <span className="sheet-bar-value">
                    {characterState.corruption.current} / {characterState.corruption.max}
                    {corrOver ? " ⚠" : ""}
                  </span>
                </div>
                <div className="sheet-bar">
                  <div className={`sheet-bar-fill sheet-bar-fill--corr ${corrOver ? "is-over" : ""}`} style={{ width: `${corrPct}%` }} />
                  <div className="sheet-bar-threshold" style={{ left: `${(characterState.corruption.threshold / characterState.corruption.max) * 100}%` }} />
                </div>
              </section>

              {/* 六维属性 */}
              <section className="sheet-section">
                <div className="sheet-section-title">属性</div>
                <div className="attr-grid">
                  {ATTRIBUTE_ROWS.map((row) => {
                    const val = characterState.attributes[row.key];
                    const mod = abilityModifier(val);
                    return (
                      <div key={row.key} className="attr-cell">
                        <span className="attr-abbr">{row.abbr}</span>
                        <span className="attr-val">{val}</span>
                        <span className={`attr-mod ${mod >= 0 ? "is-pos" : "is-neg"}`}>
                          {mod >= 0 ? "+" : ""}{mod}
                        </span>
                        <span className="attr-label">{row.label}</span>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* 物品清单 */}
              {characterState.resources.length > 0 ? (
                <section className="sheet-section">
                  <div className="sheet-section-title">物品</div>
                  <div className="res-list">
                    {characterState.resources.map((r) => (
                      <span key={r.id} className={`res-chip ${r.qty <= 0 ? "is-empty" : ""}`}>
                        {r.name} <em>×{r.qty}</em>
                      </span>
                    ))}
                  </div>
                </section>
              ) : null}

              {/* 局势 + 运气 */}
              <section className="sheet-section">
                <div className="sheet-meta-row">
                  <span className={`pressure-tag pressure-tag--${pressureMeta.tone}`} title={pressure.hint}>
                    局势：{pressureMeta.label}
                  </span>
                  <span className="luck-tag">♦ 运气 {luckPoints}/{maxLuckPoints}</span>
                </div>
              </section>

              {/* 最近判定 */}
              {recentRolls.length > 0 ? (
                <section className="sheet-section">
                  <div className="sheet-section-title">最近判定</div>
                  <ul className="sheet-rolls">
                    {recentRolls.map((r) => (
                      <li key={r.id} className={`sheet-roll ${r.success ? "is-success" : "is-fail"}`}>
                        <span className="sheet-roll-dice">d{r.roll}{typeof r.total === "number" ? `→${r.total}` : ""}/DC{r.dc}</span>
                        <span className="sheet-roll-action">
                          {r.isReroll ? "⟲ " : ""}{r.action}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          )}
        </div>
      </aside>
    </>
  );
});
