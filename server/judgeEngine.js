/**
 * Minimal dice roller – rolls a d20 and formats the result
 * for injection into the LLM conversation.
 * All difficulty / outcome interpretation is left to the AI.
 */

export function rollD20() {
  return Math.floor(Math.random() * 20) + 1;
}

/**
 * Calculate DC (Difficulty Class) based on action description
 * Returns DC 10-20, or null if no check needed
 */
export function calculateDC(action) {
  const safeAction = String(action || "").toLowerCase();
  
  // Keywords that trigger checks
  const checkKeywords = [
    "攻击", "战斗", "刺杀", "格斗", "射击",
    "潜行", "躲藏", "偷窃", "开锁", "破解",
    "说服", "欺骗", "恐吓", "交涉",
    "调查", "搜寻", "察觉", "追踪",
    "跳跃", "攀爬", "游泳", "平衡",
    "治疗", "急救", "辨识", "分析"
  ];
  
  const needsCheck = checkKeywords.some(kw => safeAction.includes(kw));
  if (!needsCheck) return null;
  
  // Determine difficulty based on context
  if (/困难|棘手|复杂|专家|大师/i.test(safeAction)) return 15;
  if (/不可能|绝望|疯狂|自杀/i.test(safeAction)) return 18;
  if (/简单|容易|基础/i.test(safeAction)) return 10;
  
  return 12; // Default medium difficulty
}

export function formatDiceForModel(roll, action, dc) {
  const safeAction = String(action || "").trim().slice(0, 80);
  const hasCheck = dc !== null;
  
  if (!hasCheck) {
    return [
      "【系统提示】",
      `- 玩家行动：${safeAction || "（未指定）"}`,
      "该行动无需掷骰判定，直接按合理结果推进叙事。"
    ].join("\n");
  }
  
  const success = roll >= dc;
  const margin = roll - dc;
  let quality = "";
  if (roll === 20) quality = "（大成功！）";
  else if (roll === 1) quality = "（大失败！）";
  else if (margin >= 5) quality = "（轻松成功）";
  else if (margin <= -5) quality = "（明显失败）";
  else if (success) quality = "（成功）";
  else quality = "（失败）";
  
  return [
    "【系统掷骰结果（后端真实随机，必须参考）】",
    `- 玩家行动：${safeAction || "（未指定）"}`,
    `- 难度等级：DC ${dc}`,
    `- 掷骰结果：d20 = ${roll}${quality}`,
    `请根据以上判定结果推进剧情叙事。`,
    `${success ? "行动成功" : "行动失败"}，${margin >= 5 ? "效果超预期" : margin <= -5 ? "效果不佳" : "正常结果"}。`,
    "不要单独输出【判定】段落，直接将结果融入场景叙事即可。"
  ].join("\n");
}

export function formatDiceChip(roll, dc = null) {
  if (dc === null) {
    return null; // No check needed
  }
  
  const success = roll >= dc;
  const flavor = roll === 20 ? " 大成功！" : roll === 1 ? " 大失败！" : "";
  const result = success ? "✓ 成功" : "✗ 失败";
  return `d20=${roll} vs DC${dc} → ${result}${flavor}`;
}

