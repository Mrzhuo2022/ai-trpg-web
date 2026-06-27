import { useEffect, useRef, useState, memo } from "react";
import type { CheckQuality } from "../types";

export interface DiceOverlayProps {
  /** 是否正在掷骰（控制浮层显隐） */
  active: boolean;
  /** 最终骰值 */
  roll?: number;
  /** 属性调整值 */
  modifier?: number;
  /** 属性缩写（STR/DEX/...） */
  attributeAbbr?: string | null;
  /** 属性中文标签 */
  attributeLabel?: string | null;
  /** 总值 */
  total?: number;
  /** 难度 */
  dc?: number;
  /** 判定质量 */
  quality?: CheckQuality;
  /** 是否重投 */
  isReroll?: boolean;
}

const ROLL_DURATION = 1100;

const QUALITY_COPY: Record<CheckQuality, { title: string; tone: string }> = {
  crit_success: { title: "大成功", tone: "crit-success" },
  crit_fail: { title: "大失败", tone: "crit-fail" },
  great_success: { title: "轻松成功", tone: "success" },
  great_fail: { title: "明显失败", tone: "fail" },
  success: { title: "成功", tone: "success" },
  fail: { title: "失败", tone: "fail" }
};

function playTone(frequency: number, durationMs: number, type: OscillatorType = "sine") {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationMs / 1000);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + durationMs / 1000);
    osc.onended = () => { try { ctx.close(); } catch { /* ignore */ } };
  } catch { /* 静默兜底 */ }
}

export const DiceOverlay = memo(function DiceOverlay({
  active,
  roll,
  modifier,
  attributeAbbr,
  attributeLabel,
  total,
  dc,
  quality,
  isReroll
}: DiceOverlayProps) {
  const [displayRoll, setDisplayRoll] = useState(20);
  const [phase, setPhase] = useState<"rolling" | "settled" | "hidden">("hidden");
  const rafRef = useRef<number>(0);
  const timeoutRef = useRef<number | null>(null);
  // 安全超时：active 后最多 5 秒强制隐藏，防止 rolling 状态卡住导致遮罩永久锁死界面
  const safetyTimerRef = useRef<number | null>(null);
  // 记录上一次触发动画的 roll，避免同一 roll 重复触发
  const lastAnimatedRollRef = useRef<number | null>(null);

  useEffect(() => {
    // 触发条件：active（rolling=true）且拿到有效 roll，且这个 roll 还没播过动画
    // 关键：动画一旦启动就跑完整周期，不被后续 rolling=false 打断
    if (!active || typeof roll !== "number") {
      return;
    }
    if (lastAnimatedRollRef.current === roll && phase !== "hidden") {
      // 同一 roll 且动画进行中，不重复触发
      return;
    }
    lastAnimatedRollRef.current = roll;

    setPhase("rolling");
    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      if (elapsed < ROLL_DURATION) {
        const progress = elapsed / ROLL_DURATION;
        const slowDown = 1 - Math.pow(progress, 2);
        const interval = 40 + slowDown * 160;
        setDisplayRoll(Math.floor(Math.random() * 20) + 1);
        timeoutRef.current = window.setTimeout(() => {
          rafRef.current = requestAnimationFrame(tick);
        }, interval);
      } else {
        setDisplayRoll(roll);
        setPhase("settled");
        if (quality === "crit_success") playTone(880, 200, "triangle");
        else if (quality === "crit_fail") playTone(180, 240, "sawtooth");
        else playTone(440, 120, "sine");
        const holdMs = quality === "crit_success" || quality === "crit_fail" ? 1600 : 900;
        timeoutRef.current = window.setTimeout(() => {
          setPhase("hidden");
        }, holdMs);
      }
    };

    rafRef.current = requestAnimationFrame(tick);

    // 安全兜底：active 激活 5 秒后强制隐藏，防止 rolling 状态未复位导致遮罩永久锁死界面（重开/发送按钮点不了）
    safetyTimerRef.current = window.setTimeout(() => {
      setPhase("hidden");
    }, 5000);

    return () => {
      cancelAnimationFrame(rafRef.current);
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      if (safetyTimerRef.current) window.clearTimeout(safetyTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, roll, quality]);

  if (phase === "hidden") return null;

  const copy = quality ? QUALITY_COPY[quality] : null;
  const isCrit = quality === "crit_success" || quality === "crit_fail";
  const hasMod = typeof modifier === "number" && modifier !== 0;
  const modStr = hasMod ? `${modifier! >= 0 ? "+" : ""}${modifier!}` : "";
  const totalStr = typeof total === "number" ? total : roll;

  return (
    <div
      className={`dice-overlay dice-overlay--${phase}${copy ? ` dice-overlay--${copy.tone}` : ""}${isCrit ? " dice-overlay--crit" : ""}`}
      role="status"
      aria-live="assertive"
    >
      {isCrit && phase === "settled" ? (
        <div className={`dice-flash dice-flash--${quality === "crit_success" ? "gold" : "red"}`} />
      ) : null}

      <div className="dice-stage">
        {/* 阶段1：掷骰动画 */}
        <div className={`dice-cube dice-cube--${phase}`}>
          <div className="dice-face">
            <span className="dice-num">{displayRoll}</span>
          </div>
        </div>

        <div className="dice-meta">
          <div className="dice-action">{isReroll ? "重投判定" : attributeLabel ? `${attributeLabel}检定` : "掷骰判定"}</div>

          {/* 阶段2（落定后）：完整公式 */}
          {phase === "settled" ? (
            <div className="dice-formula">
              <span className="dice-formula-roll">d20={roll}</span>
              {hasMod && attributeAbbr ? (
                <span className={`dice-formula-mod ${modifier! >= 0 ? "is-pos" : "is-neg"}`}>
                  {modStr}({attributeAbbr})
                </span>
              ) : null}
              <span className="dice-formula-eq">=</span>
              <span className="dice-formula-total">{totalStr}</span>
              {typeof dc === "number" ? <span className="dice-formula-vs">vs DC{dc}</span> : null}
            </div>
          ) : null}
        </div>

        {phase === "settled" && copy ? (
          <div className={`dice-result dice-result--${copy.tone}`}>{copy.title}</div>
        ) : null}
      </div>
    </div>
  );
});
