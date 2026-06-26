/**
 * 判定引擎（D&D 5e 风格，单人跑图向）
 *
 * 核心原则：所有检定由代码权威执行，模型只能演绎。
 * 1. 行动分类 → 检定属性（STR/DEX/CON/INT/WIS/CHA）
 * 2. calculateDC → 难度等级（含情境修正）
 * 3. rollD20 + 属性调整值 → 总值
 * 4. 总值 vs DC → 成败（nat 20 强制成功 / nat 1 强制失败）
 * 5. 失败按行动类型扣 HP（代码化伤害）
 * 6. 返回完整公式 + 伤害 + 状态变化
 */

import {
  abilityModifier,
  applyDamage,
  addCorruption,
  addCondition,
  rollDamage,
  ATTRIBUTE_LABELS,
  ATTRIBUTE_ABBR
} from "./characterState.js";

export function rollD20() {
  return Math.floor(Math.random() * 20) + 1;
}

/* ────────────────────────────────────────────────────────────
 * 行动类目（含检定属性映射）
 * ──────────────────────────────────────────────────────────── */
const ACTION_CATEGORIES = [
  {
    key: "combat",
    label: "战斗",
    defaultAttr: "str",
    keywords: ["攻击", "战斗", "刺杀", "格斗", "射击", "挥砍", "搏斗", "反击", "伏击", "埋伏", "突袭", "格挡", "招架"]
  },
  {
    key: "agility",
    label: "敏捷",
    defaultAttr: "dex",
    keywords: ["潜行", "躲藏", "偷窃", "开锁", "破解", "闪避", "翻滚", "杂技", "平衡", "悄悄", "溜", "撬开", "扭开", "踢开"]
  },
  {
    key: "social",
    label: "社交",
    defaultAttr: "cha",
    keywords: ["说服", "欺骗", "恐吓", "交涉", "谈判", "诱惑", "劝", "骗", "吓", "套话", "盘问", "质问", "安抚", "挑衅", "讨价"]
  },
  {
    key: "perception",
    label: "感知",
    defaultAttr: "wis",
    keywords: ["调查", "搜寻", "察觉", "追踪", "侦查", "观察", "搜索", "探查", "侦听", "警戒"]
  },
  {
    key: "knowledge",
    label: "知识",
    defaultAttr: "int",
    keywords: ["辨识", "分析", "辨认", "解读", "研究", "回忆", "推理", "破解密码", "翻译", "鉴定", "推算"]
  },
  {
    key: "survival",
    label: "生存",
    defaultAttr: "wis",
    keywords: ["治疗", "急救", "包扎", "求生", "觅食", "取水", "生火", "保暖", "防寒", "防毒", "过滤", "维修", "修理", "救治"]
  },
  {
    key: "strength",
    label: "力量",
    defaultAttr: "str",
    keywords: ["搬运", "举起", "破门", "砸门", "撞", "掰开", "撕", "扛起", "攀爬", "跳跃"]
  }
];

/* 远程/灵巧武器检定用 DEX 而非 STR */
const DEX_COMBAT_KEYWORDS = ["射击", "弓", "弩", "投掷", "飞刀", "暗器", "狙击", "开枪", "射箭"];

/* ────────────────────────────────────────────────────────────
 * 难度修饰词梯度
 * ──────────────────────────────────────────────────────────── */
const DIFFICULTY_MODIFIERS = [
  { keywords: ["自杀", "疯狂", "不可能", "绝境", "绝望", "送死", "必死", "几乎不可能"], dc: 20, label: "致命" },
  { keywords: ["极其危险", "九死一生", "极度"], dc: 19, label: "致命" },
  { keywords: ["危险", "致命", "凶险"], dc: 18, label: "危险" },
  { keywords: ["困难", "棘手", "复杂", "专家", "大师", "精巧", "精密"], dc: 16, label: "困难" },
  { keywords: ["不易", "不简单", "勉强", "勉强能"], dc: 14, label: "中等" }
];

const EASY_MODIFIERS = [
  { keywords: ["极其简单", "易如反掌", "轻而易举"], dc: 8, label: "极简" },
  { keywords: ["简单", "容易", "基础", "随手", "顺手"], dc: 10, label: "简单" }
];

/* ────────────────────────────────────────────────────────────
 * 情境修正（从上下文识别，临时抬高 DC）
 * ──────────────────────────────────────────────────────────── */
const CONTEXTUAL_PENALTIES = [
  { keywords: ["受伤", "重伤", "流血", "断臂", "骨折", "剧痛"], penalty: 2, label: "伤势影响" },
  { keywords: ["精疲力尽", "筋疲力尽", "极度疲惫", "濒临崩溃"], penalty: 2, label: "体力透支" },
  { keywords: ["黑暗中", "浓雾", "暴雨", "风雪", "严寒", "酷热", "能见度低"], penalty: 1, label: "环境恶劣" },
  { keywords: ["资源耗尽", "弹尽粮绝", "滤芯耗尽", "弹药不足", "没有工具", "徒手"], penalty: 2, label: "资源匮乏" },
  { keywords: ["被包围", "腹背受敌", "人多势众", "数量悬殊"], penalty: 2, label: "敌众我寡" },
  { keywords: ["紧急", "千钧一发", "时间所剩无几", "倒计时", "即将"], penalty: 1, label: "时间紧迫" }
];

const NO_CHECK_PATTERNS = [
  /^.{0,6}(说|道|问|喊|叫|告诉|回答)/,
  /查看|观察一下|看看|打听|询问|回想|回忆|思考|思考一下|想$/,
  /走向|走到|前往|离开|进入|退出|跟着|靠近|远离/,
  /拿起|收起|放下|穿上|脱下|装备|取出/,
  /休息|等待|停留|坐下|站起/
];

/* ────────────────────────────────────────────────────────────
 * 行动分类 + 属性映射
 * ──────────────────────────────────────────────────────────── */
export function classifyAction(safeAction) {
  for (const cat of ACTION_CATEGORIES) {
    if (cat.keywords.some((kw) => safeAction.includes(kw))) {
      return cat;
    }
  }
  return null;
}

/**
 * 决定本次检定使用的属性
 * combat 类需进一步区分近战(STR)/远程(DEX)
 */
export function mapAttribute(category, safeAction) {
  if (!category) return null;
  if (category.key === "combat" && DEX_COMBAT_KEYWORDS.some((kw) => safeAction.includes(kw))) {
    return "dex";
  }
  return category.defaultAttr;
}

/* ────────────────────────────────────────────────────────────
 * 计算 DC
 * ──────────────────────────────────────────────────────────── */
export function calculateDC(action, contextText = "", opts = {}) {
  const safeAction = String(action || "").toLowerCase().trim();
  const safeContext = String(contextText || "").toLowerCase();

  if (!safeAction) return null;

  const category = classifyAction(safeAction);

  if (!category && NO_CHECK_PATTERNS.some((re) => re.test(safeAction))) {
    return null;
  }

  let dc = 12;
  let difficultyLabel = "中等";

  let matchedHard = null;
  for (const mod of DIFFICULTY_MODIFIERS) {
    if (mod.keywords.some((kw) => safeAction.includes(kw))) {
      matchedHard = mod;
      break;
    }
  }
  let matchedEasy = null;
  if (!matchedHard) {
    for (const mod of EASY_MODIFIERS) {
      if (mod.keywords.some((kw) => safeAction.includes(kw))) {
        matchedEasy = mod;
        break;
      }
    }
  }

  if (matchedHard) {
    dc = matchedHard.dc;
    difficultyLabel = matchedHard.label;
  } else if (matchedEasy) {
    dc = matchedEasy.dc;
    difficultyLabel = matchedEasy.label;
  } else if (category?.key === "combat") {
    dc = 13;
  } else if (category?.key === "knowledge") {
    dc = 13;
  } else if (!category) {
    return null;
  }

  // 情境修正
  const modifiers = [];
  let totalPenalty = 0;
  for (const ctx of CONTEXTUAL_PENALTIES) {
    if (ctx.keywords.some((kw) => safeContext.includes(kw) || safeAction.includes(kw))) {
      modifiers.push({ label: ctx.label, penalty: ctx.penalty });
      totalPenalty += ctx.penalty;
    }
  }
  totalPenalty = Math.min(totalPenalty, 4);
  dc = Math.min(20, dc + totalPenalty);

  // 被攻击时，目标 AC 影响 DC（opts.targetAc）
  if (typeof opts.targetAc === "number" && opts.targetAc > 0 && category?.key === "combat") {
    dc = Math.max(dc, Math.min(20, opts.targetAc));
  }

  return { dc, category: category?.key || "general", categoryLabel: category?.label || "行动", difficulty: difficultyLabel, modifiers };
}

/* ────────────────────────────────────────────────────────────
 * 伤害规则（代码化，按行动类型）
 * ──────────────────────────────────────────────────────────── */
const DAMAGE_RULES = {
  combat: { fail: "1d8", critFail: "2d8", condFail: null, condCritFail: "bleeding" },
  agility: { fail: "1d4", critFail: "1d6", condFail: null, condCritFail: "exposed" },
  strength: { fail: "1d6", critFail: "1d8", condFail: null, condCritFail: "sprained" },
  survival: { fail: null, critFail: null, corruptionFail: 8, corruptionCritFail: 20, condFail: null, condCritFail: "infected" },
  social: { fail: null, critFail: null, corruptionFail: 3, corruptionCritFail: 8, condFail: null, condCritFail: null },
  perception: { fail: null, critFail: null, corruptionFail: 2, corruptionCritFail: 5, condFail: null, condCritFail: null },
  knowledge: { fail: null, critFail: null, corruptionFail: 2, corruptionCritFail: 5, condFail: null, condCritFail: null },
  general: { fail: null, critFail: "1d4", corruptionFail: 0, corruptionCritFail: 5, condFail: null, condCritFail: null }
};

/**
 * 计算伤害并应用到角色状态（纯函数：返回新状态 + 变化记录）
 */
export function applyCheckConsequences(state, evaluated) {
  if (!state || !evaluated) return { state, damage: null };

  const rule = DAMAGE_RULES[evaluated.category] || DAMAGE_RULES.general;
  const damage = { hp: 0, corruption: 0, condition: null, resources: [] };
  let nextState = state;

  if (evaluated.success) {
    // 成功：无伤害，大成功可微量净化腐化
    if (evaluated.quality === "crit_success" && state.corruption?.current > 0) {
      const reduce = Math.min(3, state.corruption.current);
      nextState = { ...nextState, corruption: { ...nextState.corruption, current: state.corruption.current - reduce } };
      damage.corruption = -reduce;
    }
    return { state: nextState, damage };
  }

  // 失败 / 大失败
  const isCritFail = evaluated.quality === "crit_fail";

  // HP 伤害（物理类行动）
  const diceExpr = isCritFail ? rule.critFail : rule.fail;
  if (diceExpr) {
    const hpDmg = rollDamage(diceExpr);
    nextState = applyDamage(nextState, hpDmg);
    damage.hp = hpDmg;
  }

  // 腐化伤害（精神/生存类行动）
  const corruptionAmt = isCritFail ? (rule.corruptionCritFail || 0) : (rule.corruptionFail || 0);
  if (corruptionAmt > 0) {
    nextState = addCorruption(nextState, corruptionAmt);
    damage.corruption = corruptionAmt;
  }

  // 大失败附加状态
  if (isCritFail && rule.condCritFail) {
    nextState = addCondition(nextState, rule.condCritFail);
    damage.condition = rule.condCritFail;
  }

  return { state: nextState, damage };
}

/* ────────────────────────────────────────────────────────────
 * 结构化评估一次掷骰（完整 D&D 5e 检定）
 * ──────────────────────────────────────────────────────────── */
export function evaluateCheck(roll, dc, checkInfo, attributes) {
  const safeRoll = Number(roll) || 0;
  const safeDc = Number(dc) || 10;

  // 属性调整值
  const attribute = checkInfo ? mapAttribute({ key: checkInfo.category }, String(roll)) : null;
  // 注意：mapAttribute 需要 action 文本区分近战/远程，这里直接用 checkInfo.category 的默认属性
  const resolvedAttr = resolveAttribute(checkInfo, attributes);
  const modifier = resolvedAttr ? abilityModifier(attributes[resolvedAttr.key]) : 0;

  const total = safeRoll + modifier;

  // nat 20 强制成功，nat 1 强制失败
  let success;
  if (safeRoll === 20) success = true;
  else if (safeRoll === 1) success = false;
  else success = total >= safeDc;

  const margin = total - safeDc;

  let quality;
  if (safeRoll === 20) quality = "crit_success";
  else if (safeRoll === 1) quality = "crit_fail";
  else if (margin >= 5) quality = "great_success";
  else if (margin <= -5) quality = "great_fail";
  else if (success) quality = "success";
  else quality = "fail";

  return {
    roll: safeRoll,
    modifier,
    attribute: resolvedAttr?.key || null,
    attributeLabel: resolvedAttr?.label || null,
    attributeAbbr: resolvedAttr?.abbr || null,
    total,
    dc: safeDc,
    success,
    margin,
    quality,
    category: checkInfo?.category || "general",
    categoryLabel: checkInfo?.categoryLabel || "行动",
    difficulty: checkInfo?.difficulty || "中等",
    modifiers: checkInfo?.modifiers || [],
    label: QUALITY_LABELS[quality]
  };
}

/** 根据行动信息解析使用的属性（需要 action 文本来区分 combat 近战/远程） */
function resolveAttribute(checkInfo, attributes) {
  if (!checkInfo) return null;
  const cat = ACTION_CATEGORIES.find((c) => c.key === checkInfo.category);
  if (!cat) return null;
  // combat 类的近战/远程区分已在 calculateDC 阶段无法获取 action，这里用 category 默认属性
  // 真正的 DEX 区分由 evaluateCheckWithAction 提供
  return {
    key: cat.defaultAttr,
    label: ATTRIBUTE_LABELS[cat.defaultAttr],
    abbr: ATTRIBUTE_ABBR[cat.defaultAttr]
  };
}

/**
 * 完整检定入口：接收 action 文本（用于 combat 近战/远程区分）
 * 返回带正确属性的 evaluated
 */
export function evaluateCheckWithAction(roll, dc, checkInfo, attributes, actionText) {
  const safeAction = String(actionText || "").toLowerCase();
  const cat = ACTION_CATEGORIES.find((c) => c.key === checkInfo?.category);

  let attrKey = cat?.defaultAttr || null;
  // combat 近战/远程区分
  if (checkInfo?.category === "combat" && DEX_COMBAT_KEYWORDS.some((kw) => safeAction.includes(kw))) {
    attrKey = "dex";
  }

  const modifier = attrKey && attributes ? abilityModifier(attributes[attrKey]) : 0;
  const safeRoll = Number(roll) || 0;
  const safeDc = Number(dc) || 10;
  const total = safeRoll + modifier;

  let success;
  if (safeRoll === 20) success = true;
  else if (safeRoll === 1) success = false;
  else success = total >= safeDc;

  const margin = total - safeDc;
  let quality;
  if (safeRoll === 20) quality = "crit_success";
  else if (safeRoll === 1) quality = "crit_fail";
  else if (margin >= 5) quality = "great_success";
  else if (margin <= -5) quality = "great_fail";
  else if (success) quality = "success";
  else quality = "fail";

  return {
    roll: safeRoll,
    modifier,
    attribute: attrKey,
    attributeLabel: attrKey ? ATTRIBUTE_LABELS[attrKey] : null,
    attributeAbbr: attrKey ? ATTRIBUTE_ABBR[attrKey] : null,
    total,
    dc: safeDc,
    success,
    margin,
    quality,
    category: checkInfo?.category || "general",
    categoryLabel: checkInfo?.categoryLabel || "行动",
    difficulty: checkInfo?.difficulty || "中等",
    modifiers: checkInfo?.modifiers || [],
    label: QUALITY_LABELS[quality]
  };
}

const QUALITY_LABELS = {
  crit_success: "大成功",
  crit_fail: "大失败",
  great_success: "轻松成功",
  success: "成功",
  fail: "失败",
  great_fail: "明显失败"
};

/* ────────────────────────────────────────────────────────────
 * 注入给模型的判定上下文（强约束 + 状态权威）
 * ──────────────────────────────────────────────────────────── */
export function formatDiceForModel(evaluated, action, damage, stateAfter) {
  const safeAction = String(action || "").trim().slice(0, 80);
  const { roll, modifier, attributeAbbr, total, dc, success, quality, categoryLabel, difficulty } = evaluated;

  if (!dc || roll === undefined) {
    return [
      "【系统提示】",
      `- 玩家行动：${safeAction || "（未指定）"}`,
      "该行动无需掷骰判定，直接按合理结果推进叙事。"
    ].join("\n");
  }

  const modStr = modifier >= 0 ? `+${modifier}` : `${modifier}`;
  const formula = attributeAbbr ? `d20(${roll}) ${modStr}(${attributeAbbr}) = ${total}` : `d20(${roll}) = ${total}`;

  const outcomeLine = success
    ? quality === "crit_success"
      ? "行动【大成功】：效果远超预期，可赋予意外收获或戏剧性转机。"
      : quality === "great_success"
        ? "行动【轻松成功】：玩家从容达成目标，几乎无代价。"
        : "行动【成功】：玩家达成意图，保留合理后续风险。"
    : quality === "crit_fail"
      ? "行动【大失败】：灾难性后果，已在系统层扣除代价，请在叙事中戏剧化体现。"
      : quality === "great_fail"
        ? "行动【明显失败】：玩家明显失手，已在系统层扣除代价。"
        : "行动【失败】：玩家未能达成，已在系统层扣除代价。";

  const damageLines = [];
  if (damage) {
    if (damage.hp > 0) damageLines.push(`HP -${damage.hp}（剩余 ${stateAfter.hp.current}/${stateAfter.hp.max}）`);
    if (damage.corruption > 0) damageLines.push(`${stateAfter.corruption.name} +${damage.corruption}（当前 ${stateAfter.corruption.current}/${stateAfter.corruption.max}）`);
    if (damage.corruption < 0) damageLines.push(`${stateAfter.corruption.name} -${-damage.corruption}（净化，当前 ${stateAfter.corruption.current}/${stateAfter.corruption.max}）`);
    if (damage.condition) damageLines.push(`附加状态：${CONDITION_LABELS[damage.condition] || damage.condition}`);
  }
  if (stateAfter.conditions.includes("downed")) damageLines.push("⚠ 角色已倒下（HP 归零），必须描写濒死或被救场景。");
  if (stateAfter.conditions.includes("corrupted")) damageLines.push("⚠ 角色腐化超阈值，精神状态不稳定。");

  return [
    "【系统判定·权威（代码执行，不可篡改）】",
    `- 玩家行动：${safeAction || "（未指定）"}`,
    `- 行动类型：${categoryLabel}`,
    `- 难度等级：DC ${dc}（${difficulty}）`,
    `- 检定公式：${formula}`,
    `- 判定结论：${success ? "成功" : "失败"}（${QUALITY_LABELS[quality]}）`,
    damageLines.length ? `- 系统已扣除代价：${damageLines.join("；")}` : "- 本次无代价扣除。",
    "",
    outcomeLine,
    "",
    "【叙事硬约束】",
    "1. 上述成败结论与扣除的代价由代码权威执行，不可篡改：失败的行动不能凭空成功，HP/腐化变化必须如实体现。",
    "2. 把判定过程自然融入场景叙事（动作、环境反馈、NPC 反应），不要单独输出【判定】段落，不要重复罗列公式数字。",
    "3. 大成功/大失败必须有戏剧化表现。",
    "4. 不得自行扣血、发放物品或改变腐化值——这些只能由系统判定驱动。"
  ].join("\n");
}

const CONDITION_LABELS = {
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

/* ────────────────────────────────────────────────────────────
 * 供前端展示的简短文案
 * ──────────────────────────────────────────────────────────── */
export function formatDiceChip(evaluated) {
  if (!evaluated || !evaluated.dc) return null;
  const { roll, modifier, attributeAbbr, total, dc, success, quality } = evaluated;
  const modStr = modifier ? (modifier >= 0 ? `+${modifier}` : `${modifier}`) : "";
  const attrStr = attributeAbbr && modifier ? `(${attributeAbbr})` : "";
  const formula = `d20=${roll}${modStr ? ` ${modStr}${attrStr}` : ""}=${total}`;
  const flavor = quality === "crit_success" ? " 大成功！"
    : quality === "crit_fail" ? " 大失败！"
    : quality === "great_success" ? " 轻松成功"
    : quality === "great_fail" ? " 明显失败"
    : "";
  const result = success ? "✓ 成功" : "✗ 失败";
  return `${formula} vs DC${dc} → ${result}${flavor}`;
}

/* ────────────────────────────────────────────────────────────
 * 启发式压力推算（保留原逻辑）
 * ──────────────────────────────────────────────────────────── */
const PRESSURE_SIGNALS = [
  { level: 3, keywords: ["濒死", "即将崩溃", "全面失控", "全军覆没", "必死", "弹尽粮绝", "感染失控", "断电", "窒息", "溃败", "撕卡", "理智崩溃", "倒下"] },
  { level: 2, keywords: ["重伤", "危机", "千钧一发", "倒计时", "所剩无几", "暴露", "包围", "穷途末路", "燃料不足", "弹药告急", "滤芯告急", "腐化飙升", "流血"] },
  { level: 1, keywords: ["受伤", "危险", "紧迫", "险情", "异动", "警戒", "敌意", "威胁", "资源紧张", "时间紧迫"] }
];

const PRESSURE_HINTS = {
  0: "局势平稳，可以谨慎推进。",
  1: "紧张感上升，留意潜在威胁。",
  2: "局势危急，每一步都可能引发连锁反应。",
  3: "绝境之中，决策关乎生死。"
};

export function calculatePressure(recentMessages = []) {
  if (!Array.isArray(recentMessages) || !recentMessages.length) {
    return { level: 0, hint: PRESSURE_HINTS[0] };
  }
  const window = recentMessages.slice(-6);
  const text = window
    .map((m) => (typeof m?.content === "string" ? m.content.toLowerCase() : ""))
    .join(" ");

  let level = 0;
  for (const signal of PRESSURE_SIGNALS) {
    if (signal.keywords.some((kw) => text.includes(kw))) {
      level = Math.max(level, signal.level);
    }
  }
  return { level, hint: PRESSURE_HINTS[level] };
}

export function pressureFromFailStreak(failStreak = 0, base = { level: 0, hint: PRESSURE_HINTS[0] }) {
  let level = base.level;
  if (failStreak >= 3) level = Math.max(level, 3);
  else if (failStreak >= 2) level = Math.max(level, 2);
  else if (failStreak >= 1) level = Math.max(level, 1);
  return { level, hint: PRESSURE_HINTS[level] };
}
