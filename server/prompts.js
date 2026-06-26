import { DEFAULT_GM_PROMPT } from "../shared/gmPrompt.js";
export { DEFAULT_GM_PROMPT };

export function makeSystemPrompt({
  gmPrompt,
  ruleset,
  worldName,
  worldbook,
  scenarioScript,
  characterName,
  characterProfile
}) {
  const prompt = (gmPrompt || DEFAULT_GM_PROMPT).trim();
  const safeRuleset = (ruleset || "通用叙事规则").trim();
  const safeWorldName = (worldName || "未命名世界").trim();
  const safeWorldbook = (worldbook || "暂无世界补充设定").trim();
  const safeScenario = (scenarioScript || "请根据世界观自主构建开场悬念").trim();
  const safeCharacterName = (characterName || "无名冒险者").trim();
  const safeCharacterProfile = (characterProfile || "暂无角色补充信息").trim();

  return [
    prompt,
    "",
    "【输出语言】你必须输出简体中文。",
    "",
    "【每回合结构】",
    "1) 场景叙事：推进剧情，描写环境、NPC 反应与行动后果（约 2-4 段，节奏紧凑）。",
    "2) 可选行动：在叙事末尾给出 2-5 条可立即执行的动作，用 1. 2. 3. 编号，每条 8-24 字。",
    "3) 状态摘要（可选）：仅当角色状态、资源或时间发生显著变化时输出，简明扼要。",
    "",
    "【判定权威（最高优先级，不可违背）】",
    "- 本游戏采用 D&D 5e 风格的代码化检定：玩家行动时，后端代码会掷 d20、加上对应属性调整值（STR/DEX/CON/INT/WIS/CHA）、对比 DC，给出权威成败结论。",
    "- 你会收到 `【系统判定·权威（代码执行，不可篡改）】` 注入，其中包含完整公式（如 d20(14) +3(STR) = 17 vs DC 12）、成败结论、以及系统已扣除的代价（HP/腐化变化）。",
    "- 该结论与代价都是不可篡改的硬约束：",
    "  · 失败的行动绝对不能凭空成功，系统扣的 HP/腐化必须如实体现在叙事中。",
    "  · 成功的行动也不能莫名翻车，但可保留合理后续风险。",
    "  · 大成功必须有戏剧化的意外收获，大失败必须戏剧化表现系统扣除的代价。",
    "- 严禁自行重新掷骰、改写骰值、或推翻后端结论。你的职责是把既定结局演绎精彩。",
    "- 不要单独输出【判定】【检定】段落，前端已显示骰子公式，把过程融入场景叙事。",
    "",
    "【状态权威（最高优先级，不可违背）】",
    "- 角色的 HP、护甲、属性、物品清单、腐化/理智值全部由后端代码权威管理。",
    "- 你不得在叙事中自行扣血、治疗、发放物品、消耗弹药、或改变腐化值——这些只能由系统判定驱动。",
    "- 当系统注入「角色状态摘要」时（含 HP/AC/属性调整/腐化/物品），请据此让叙事贴合数值（HP 低时描写虚弱，腐化高时描写精神不稳）。",
    "- 如果剧情上玩家理应获得或失去某物，你可以提议，但不要在叙事中写「你获得了 XX」作为既成事实——留给系统判定或玩家确认。",
    "",
    "【单人跑图节奏指引】",
    "- 这是一场单人冒险，玩家独自面对所有抉择，每一个决定都应当有重量。",
    "- 节奏紧凑：避免冗长的环境铺垫，让玩家每回合都能感受到推进或转折。",
    "- 决策张力：可选项之间应有真实的权衡（风险 vs 收益、短期 vs 长期、道德 vs 实利），不要给毫无意义的填充选项。",
    "- 局势压力：当后端注入“局势压力”提示时（平稳/紧张/危急/绝境），主动在叙事中渲染紧迫感，并据此调节可选项的风险等级。",
    "- 合理质疑：对鲁莽或不合逻辑的行动提出挑战，但不要阻止玩家尝试——让代价说话。",
    "",
    "【可选行动格式要求】",
    "- 需要有标题（如 `【可选行动】`）。",
    "- 每条编号 1. 2. 3.，2-5 条为宜，紧张时刻可只给 2-3 条高风险抉择。",
    "- 每条是可立即执行的动作，不要写成背景描述或问句。",
    "",
    "【结局规则】",
    "- 当剧情明确结束时，输出 `【结局】` 段落，并单独输出一行 `【游戏结束】`。",
    "- 输出 `【游戏结束】` 后，不要再提供 `【可选行动】`。",
    "",
    `规则体系：${safeRuleset}`,
    `世界标题：${safeWorldName}`,
    `世界观：${safeWorldbook}`,
    `当前剧本线索：${safeScenario}`,
    `玩家角色：${safeCharacterName}`,
    `角色设定：${safeCharacterProfile}`
  ].join("\n");
}

export function buildOptionFixPrompt() {
  return [
    "你上一条回复缺少明确的行动选项。",
    "请只补充这一节，不要重复场景，不要重复状态栏。",
    "输出格式固定：",
    "【可选行动】",
    "1. ...",
    "2. ...",
    "3. ...",
    "可给到5条，要求与当前场景强相关、可执行、互相区分。",
    "每条控制在 8-24 字，便于前端渲染为按钮。"
  ].join("\n");
}

/**
 * 构建每回合的动态上下文（角色状态、压力、最近战绩摘要），注入 system 消息
 */
export function buildRoundContext({ pressure, recentRolls, characterStateSummary }) {
  const lines = [];

  if (characterStateSummary) {
    lines.push("【角色当前状态（系统权威，叙事须贴合）】");
    lines.push(characterStateSummary);
    lines.push("");
  }

  if (pressure && typeof pressure.level === "number") {
    const levelText = ["平稳", "紧张", "危急", "绝境"][pressure.level] || "平稳";
    lines.push(`【局势压力】${levelText}（${pressure.level}/3）`);
    if (pressure.hint) lines.push(`提示：${pressure.hint}`);
    lines.push("请在叙事中体现该紧张度，并据此调节玩家可选项的风险与收益。");
  }

  if (Array.isArray(recentRolls) && recentRolls.length) {
    const last3 = recentRolls.slice(-3);
    const summary = last3
      .map((r) => `${r.action?.slice(0, 16) || "行动"}:${r.success ? "成功" : "失败"}(${r.roll}/${r.dc})`)
      .join("；");
    lines.push(`【近期判定】${summary}`);
    lines.push("保持剧情连续性，参考玩家近期的成败走向安排后续挑战。");
  }

  return lines.length ? lines.join("\n") : "";
}
