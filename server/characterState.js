/**
 * 角色状态模型（D&D 5e 风格，单人跑图向）
 *
 * 所有数值状态由后端代码权威管理：HP、护甲、六维属性、物品清单、腐化/理智条。
 * 模型（GM）只能演绎这些既定数值，不得自行扣血、发放物品或改变腐化。
 *
 * 所有变更函数都是纯函数：接收 state，返回新 state，不就地修改。
 */

/* ────────────────────────────────────────────────────────────
 * 属性调整值（D&D 5e 标准公式）
 * modifier = floor((value - 10) / 2)
 * ──────────────────────────────────────────────────────────── */
export function abilityModifier(value) {
  const safe = Math.max(1, Math.min(30, Number(value) || 10));
  return Math.floor((safe - 10) / 2);
}

export const ATTRIBUTE_KEYS = ["str", "dex", "con", "int", "wis", "cha"];

export const ATTRIBUTE_LABELS = {
  str: "力量",
  dex: "敏捷",
  con: "体质",
  int: "智力",
  wis: "感知",
  cha: "魅力"
};

export const ATTRIBUTE_ABBR = {
  str: "STR",
  dex: "DEX",
  con: "CON",
  int: "INT",
  wis: "WIS",
  cha: "CHA"
};

function rollDie(sides) {
  return Math.floor(Math.random() * sides) + 1;
}

function rollDice(expr) {
  // 解析 "2d8" / "1d6" / "1d4+2" 形式
  const m = String(expr).match(/^(\d+)d(\d+)(?:([+-]\d+))?$/i);
  if (!m) return 0;
  const count = Math.max(1, parseInt(m[1], 10));
  const sides = Math.max(1, parseInt(m[2], 10));
  const bonus = m[3] ? parseInt(m[3], 10) : 0;
  let sum = 0;
  for (let i = 0; i < count; i++) sum += rollDie(sides);
  return sum + bonus;
}

/* ────────────────────────────────────────────────────────────
 * 创建初始角色状态
 * 从 settings 的结构化属性初始化
 * ──────────────────────────────────────────────────────────── */
export function createCharacterState({
  attributes,
  baseHp,
  baseAc,
  corruptionName = "腐化",
  corruptionMax = 100,
  corruptionThreshold = 70,
  initialResources = []
} = {}) {
  const attrs = attributes || {};
  const safeAttrs = {};
  for (const key of ATTRIBUTE_KEYS) {
    const raw = Number(attrs[key]);
    safeAttrs[key] = Number.isFinite(raw) ? Math.max(3, Math.min(20, Math.floor(raw))) : 10;
  }

  // HP 基础值：若未指定，按 CON 推导（5e 风格：10 + CON 调整值 + 4×(level-1)）
  const conMod = abilityModifier(safeAttrs.con);
  const maxHp = Math.max(1, Math.floor(Number(baseHp) || (10 + conMod)));

  const safeAc = Math.max(1, Math.floor(Number(baseAc) || (10 + abilityModifier(safeAttrs.dex))));

  // 物品清单去重 + 数值规范化
  const resources = (Array.isArray(initialResources) ? initialResources : [])
    .filter((r) => r && r.name)
    .map((r, i) => ({
      id: r.id || `res_${i}_${Date.now().toString(36)}`,
      name: String(r.name).slice(0, 24),
      qty: Math.max(0, Math.floor(Number(r.qty) || 0)),
      unit: r.unit || "个"
    }));

  return {
    attributes: safeAttrs,
    hp: { current: maxHp, max: maxHp, temp: 0 },
    ac: safeAc,
    resources,
    corruption: {
      name: corruptionName,
      current: 0,
      max: Math.max(1, Math.floor(corruptionMax)),
      threshold: Math.max(1, Math.min(Math.floor(corruptionMax) - 1, Math.floor(corruptionThreshold)))
    },
    conditions: [],
    level: 1
  };
}

/* ────────────────────────────────────────────────────────────
 * 状态变更纯函数
 * ──────────────────────────────────────────────────────────── */

/** 扣血：先扣临时 HP，再扣本体 */
export function applyDamage(state, amount) {
  if (!state || amount <= 0) return state;
  let remaining = Math.floor(amount);
  let temp = state.hp.temp || 0;
  let current = state.hp.current;

  if (temp > 0) {
    const absorbed = Math.min(temp, remaining);
    temp -= absorbed;
    remaining -= absorbed;
  }
  current = Math.max(0, current - remaining);

  return {
    ...state,
    hp: { ...state.hp, current, temp },
    conditions: current <= 0 && !state.conditions.includes("downed")
      ? [...state.conditions, "downed"]
      : state.conditions
  };
}

/** 治疗 */
export function heal(state, amount) {
  if (!state || amount <= 0) return state;
  const current = Math.min(state.hp.max, state.hp.current + Math.floor(amount));
  const conditions = current > 0
    ? state.conditions.filter((c) => c !== "downed")
    : state.conditions;
  return { ...state, hp: { ...state.hp, current }, conditions };
}

/** 增加腐化/理智值 */
export function addCorruption(state, amount) {
  if (!state || amount <= 0) return state;
  const current = Math.min(state.corruption.max, state.corruption.current + Math.floor(amount));
  const overThreshold = current >= state.corruption.threshold;
  const conditions = overThreshold && !state.conditions.includes("corrupted")
    ? [...state.conditions, "corrupted"]
    : state.conditions;
  return { ...state, corruption: { ...state.corruption, current }, conditions };
}

/** 减少腐化（净化） */
export function reduceCorruption(state, amount) {
  if (!state || amount <= 0) return state;
  const current = Math.max(0, state.corruption.current - Math.floor(amount));
  const conditions = current < state.corruption.threshold
    ? state.conditions.filter((c) => c !== "corrupted")
    : state.conditions;
  return { ...state, corruption: { ...state.corruption, current }, conditions };
}

/** 添加物品（同名累加） */
export function addResource(state, name, qty = 1, unit = "个") {
  if (!state || !name || qty <= 0) return state;
  const resources = [...state.resources];
  const idx = resources.findIndex((r) => r.name === name);
  if (idx >= 0) {
    resources[idx] = { ...resources[idx], qty: resources[idx].qty + qty };
  } else {
    resources.push({ id: `res_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`, name, qty, unit });
  }
  return { ...state, resources };
}

/** 消耗物品（数量不足则失败，返回 { state, ok }） */
export function removeResource(state, name, qty = 1) {
  if (!state || !name || qty <= 0) return { state, ok: false };
  const idx = state.resources.findIndex((r) => r.name === name);
  if (idx < 0 || state.resources[idx].qty < qty) return { state, ok: false };
  const resources = [...state.resources];
  const after = resources[idx].qty - qty;
  resources[idx] = { ...resources[idx], qty: after };
  const filtered = resources.filter((r) => r.qty > 0);
  return { state: { ...state, resources: filtered }, ok: true };
}

/** 添加临时状态 */
export function addCondition(state, condition) {
  if (!state || !condition || state.conditions.includes(condition)) return state;
  return { ...state, conditions: [...state.conditions, condition] };
}

/** 移除临时状态 */
export function removeCondition(state, condition) {
  if (!state || !condition) return state;
  return { ...state, conditions: state.conditions.filter((c) => c !== condition) };
}

/* ────────────────────────────────────────────────────────────
 * 伤害骰（用于判定失败时的代码化伤害）
 * ──────────────────────────────────────────────────────────── */
export function rollDamage(diceExpr) {
  return rollDice(diceExpr);
}

/**
 * 生成角色状态摘要（注入给 GM，让其叙事贴合数值）
 */
export function summarizeState(state, opts = {}) {
  if (!state) return "";
  const corruptionName = state.corruption?.name || "腐化";
  const lines = [];

  const conds = state.conditions.length ? `，状态：${state.conditions.join("、")}` : "";
  lines.push(`HP ${state.hp.current}/${state.hp.max}${state.hp.temp ? `（临时+${state.hp.temp}）` : ""}，AC ${state.ac}${conds}`);
  lines.push(`${corruptionName} ${state.corruption.current}/${state.corruption.max}${state.corruption.current >= state.corruption.threshold ? "（已超阈值，影响检定）" : ""}`);

  const modParts = ATTRIBUTE_KEYS.map((k) => {
    const mod = abilityModifier(state.attributes[k]);
    return `${ATTRIBUTE_ABBR[k]}${mod >= 0 ? "+" : ""}${mod}`;
  });
  lines.push(`属性调整：${modParts.join(" ")}`);

  if (state.resources.length) {
    const resParts = state.resources.slice(0, 8).map((r) => `${r.name}×${r.qty}`);
    lines.push(`物品：${resParts.join("、")}`);
  }
  if (opts.pressureLevel) {
    lines.push(`局势压力：${["", "紧张", "危急", "绝境"][opts.pressureLevel] || "平稳"}(${opts.pressureLevel}/3)`);
  }
  return lines.join("\n");
}
