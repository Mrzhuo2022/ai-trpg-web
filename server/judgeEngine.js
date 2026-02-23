/**
 * Minimal dice roller – rolls a d20 and formats the result
 * for injection into the LLM conversation.
 * All difficulty / outcome interpretation is left to the AI.
 */

export function rollD20() {
  return Math.floor(Math.random() * 20) + 1;
}

export function formatDiceForModel(roll, action) {
  const safeAction = String(action || "").trim().slice(0, 80);
  return [
    "【系统掷骰结果（后端真实随机，必须参考）】",
    `- 玩家行动：${safeAction || "（未指定）"}`,
    `- 掷骰：d20 = ${roll}`,
    "请根据行动的合理难度与该掷骰结果自行判定成败，高骰值有利、低骰值不利，然后推进剧情叙事。",
    "不要输出你自己的掷骰数字，不要单独输出【判定】或【检定】段落，直接将成败结果融入场景叙事即可。"
  ].join("\n");
}

export function formatDiceChip(roll) {
  const flavor =
    roll === 20 ? " 大成功！" : roll === 1 ? " 大失败！" : roll >= 15 ? " 高" : roll <= 5 ? " 低" : "";
  return `d20 = ${roll}${flavor}`;
}

