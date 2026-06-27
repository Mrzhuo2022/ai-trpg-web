import { test } from "node:test";
import assert from "node:assert/strict";
import {
  rollD20,
  classifyAction,
  mapAttribute,
  calculateDC,
  evaluateCheckWithAction,
  applyCheckConsequences,
  formatDiceChip,
  calculatePressure,
  pressureFromFailStreak
} from "../server/judgeEngine.js";
import { createCharacterState, addCorruption } from "../server/characterState.js";

const ATTRS = { str: 16, dex: 14, con: 13, int: 11, wis: 12, cha: 10 };

test("rollD20: 范围 1-20", () => {
  for (let i = 0; i < 200; i++) {
    const r = rollD20();
    assert.ok(r >= 1 && r <= 20, `roll ${r} out of range`);
  }
});

test("classifyAction: 7 个类目正确归类", () => {
  assert.equal(classifyAction("攻击敌人")?.key, "combat");
  assert.equal(classifyAction("潜行过去")?.key, "agility");
  assert.equal(classifyAction("说服守卫")?.key, "social");
  assert.equal(classifyAction("调查房间")?.key, "perception");
  assert.equal(classifyAction("辨认符号")?.key, "knowledge");
  assert.equal(classifyAction("治疗伤口")?.key, "survival");
  assert.equal(classifyAction("破门而入")?.key, "strength");
});

test("classifyAction: 无风险行动返回 null", () => {
  assert.equal(classifyAction("走向窗边"), null);
  assert.equal(classifyAction("你好"), null);
  assert.equal(classifyAction("休息一下"), null);
});

test("mapAttribute: combat 近战 STR / 远程 DEX 区分", () => {
  const meleeCat = classifyAction("挥剑攻击");
  const rangedCat = classifyAction("射击敌人");
  assert.equal(meleeCat.key, "combat");
  assert.equal(rangedCat.key, "combat");
  assert.equal(mapAttribute(meleeCat, "挥剑攻击"), "str");
  assert.equal(mapAttribute(rangedCat, "射击敌人"), "dex");
});

test("calculateDC: 难度修饰词梯度", () => {
  const easy = calculateDC("简单推开木门", "");
  const normal = calculateDC("攻击卫兵", "");
  const hard = calculateDC("困难地破解密码锁", "");
  const deadly = calculateDC("自杀式冲锋", "");
  assert.ok(easy.dc <= 10, `easy dc=${easy.dc}`);
  assert.ok(normal.dc >= 12 && normal.dc <= 14);
  assert.equal(hard.dc, 16);
  assert.equal(deadly.dc, 20);
});

test("calculateDC: 情境修正累加上限 +4", () => {
  // 多重惩罚词：重伤(+2 伤势) + 弹尽粮绝(+2 资源匮乏) + 暴风雪(+1 环境)
  const r = calculateDC("攻击敌人", "我已重伤，弹尽粮绝，暴风雪中");
  assert.ok(r.modifiers.length >= 2, `应至少 2 个修正，实际 ${r.modifiers.length}：${JSON.stringify(r.modifiers)}`);
  assert.ok(r.dc <= 20, `DC 不超 20，实际 ${r.dc}`);
});

test("calculateDC: 目标 AC 影响 combat DC", () => {
  const r = calculateDC("攻击敌人", "", { targetAc: 18 });
  assert.ok(r.dc >= 18, `对高 AC 目标 DC 应≥18，实际 ${r.dc}`);
});

test("calculateDC: 纯对话/移动返回 null", () => {
  assert.equal(calculateDC("走向大门", ""), null);
  assert.equal(calculateDC("你好，请问你是谁", ""), null);
  assert.equal(calculateDC("休息等待", ""), null);
});

test("evaluateCheckWithAction: nat 20 强制成功，nat 1 强制失败", () => {
  const info = calculateDC("攻击敌人", "");
  const crit = evaluateCheckWithAction(20, info.dc, info, ATTRS, "攻击敌人");
  const fumble = evaluateCheckWithAction(1, info.dc, info, ATTRS, "攻击敌人");
  assert.equal(crit.success, true);
  assert.equal(crit.quality, "crit_success");
  assert.equal(fumble.success, false);
  assert.equal(fumble.quality, "crit_fail");
});

test("evaluateCheckWithAction: 属性调整值正确计入总值", () => {
  const info = calculateDC("挥剑攻击", ""); // combat → STR(16) → +3
  const e = evaluateCheckWithAction(10, info.dc, info, ATTRS, "挥剑攻击");
  assert.equal(e.attribute, "str");
  assert.equal(e.modifier, 3);
  assert.equal(e.total, 13);
});

test("evaluateCheckWithAction: 射击用 DEX 调整值", () => {
  const info = calculateDC("射击敌人", ""); // combat 远程 → DEX(14) → +2
  const e = evaluateCheckWithAction(10, info.dc, info, ATTRS, "射击敌人");
  assert.equal(e.attribute, "dex");
  assert.equal(e.modifier, 2);
  assert.equal(e.total, 12);
});

test("evaluateCheckWithAction: 边际分级（轻松/明显）", () => {
  const info = calculateDC("攻击敌人", "");
  // total - dc >= 5 → great_success
  const great = evaluateCheckWithAction(20, info.dc, info, ATTRS, "攻击敌人");
  assert.equal(great.quality, "crit_success"); // nat20 优先
  // 用低 DC 测 marginal
  const lowInfo = { dc: 5, category: "combat", categoryLabel: "战斗", difficulty: "简单", modifiers: [] };
  const easy = evaluateCheckWithAction(14, 5, lowInfo, ATTRS, "攻击敌人");
  assert.equal(easy.total, 17); // 14+3
  assert.equal(easy.quality, "great_success"); // 17-5=12 >=5
});

test("evaluateCheckWithAction: 无属性时 modifier=0", () => {
  const info = calculateDC("攻击敌人", "");
  const e = evaluateCheckWithAction(10, info.dc, info, null, "攻击敌人");
  assert.equal(e.modifier, 0);
  assert.equal(e.total, 10);
});

test("applyCheckConsequences: 战斗失败扣 HP", () => {
  const state = createCharacterState({ attributes: ATTRS, baseHp: 20 });
  const info = calculateDC("挥剑攻击", "");
  const fail = evaluateCheckWithAction(2, info.dc, info, ATTRS, "挥剑攻击");
  assert.equal(fail.success, false);
  const result = applyCheckConsequences(state, fail);
  assert.ok(result.damage.hp > 0, "战斗失败应扣 HP");
  assert.ok(result.state.hp.current < 20);
});

test("applyCheckConsequences: 大失败伤害更高 + 附加状态", () => {
  const state = createCharacterState({ attributes: ATTRS, baseHp: 20 });
  const info = calculateDC("挥剑攻击", "");
  const critFail = evaluateCheckWithAction(1, info.dc, info, ATTRS, "挥剑攻击");
  const result = applyCheckConsequences(state, critFail);
  assert.ok(result.damage.hp > 0);
  assert.ok(result.damage.condition, "大失败应附加状态");
});

test("applyCheckConsequences: 生存失败加腐化不扣 HP", () => {
  const state = createCharacterState({ attributes: ATTRS, baseHp: 20 });
  const info = calculateDC("防毒过滤", "毒气");
  if (info) {
    const fail = evaluateCheckWithAction(2, info.dc, info, ATTRS, "防毒过滤");
    const result = applyCheckConsequences(state, fail);
    assert.equal(result.damage.hp, 0);
    assert.ok(result.damage.corruption > 0, "生存失败应加腐化");
  }
});

test("applyCheckConsequences: 成功不扣血，大成功净化腐化", () => {
  let state = createCharacterState({ attributes: ATTRS, baseHp: 20, corruptionMax: 100, corruptionThreshold: 70 });
  state = addCorruption(state, 30);
  const info = calculateDC("攻击敌人", "");
  const crit = evaluateCheckWithAction(20, info.dc, info, ATTRS, "攻击敌人");
  const result = applyCheckConsequences(state, crit);
  assert.equal(result.damage.hp, 0);
  assert.ok(result.damage.corruption < 0, "大成功应净化腐化");
  assert.ok(result.state.corruption.current < 30);
});

test("applyCheckConsequences: HP 归零触发 downed", () => {
  let state = createCharacterState({ attributes: ATTRS, baseHp: 5 });
  const info = calculateDC("攻击敌人", "");
  // 反复大失败直到 HP 归零
  let attempts = 0;
  while (!state.conditions.includes("downed") && attempts < 20) {
    const critFail = evaluateCheckWithAction(1, info.dc, info, ATTRS, "攻击敌人");
    const r = applyCheckConsequences(state, critFail);
    state = r.state;
    attempts++;
  }
  assert.ok(state.conditions.includes("downed"), `应在 HP 归零后 downed，剩余 HP=${state.hp.current}`);
});

test("formatDiceChip: 含公式与成败", () => {
  const info = calculateDC("挥剑攻击", "");
  const e = evaluateCheckWithAction(14, info.dc, info, ATTRS, "挥剑攻击");
  const chip = formatDiceChip(e);
  assert.match(chip, /d20=14/);
  assert.match(chip, /\+3/);
  assert.match(chip, /=17/);
  assert.match(chip, /DC/);
});

test("calculatePressure: 关键词触发等级", () => {
  assert.equal(calculatePressure([{ content: "一切顺利，阳光明媚" }]).level, 0);
  assert.equal(calculatePressure([{ content: "你受伤了，感到危险" }]).level, 1);
  assert.equal(calculatePressure([{ content: "重伤，弹药告急，千钧一发" }]).level, 2);
  assert.equal(calculatePressure([{ content: "弹尽粮绝，全面失控，濒死" }]).level, 3);
});

test("pressureFromFailStreak: 连续失败升级", () => {
  assert.equal(pressureFromFailStreak(0, { level: 0, hint: "" }).level, 0);
  assert.equal(pressureFromFailStreak(1, { level: 0, hint: "" }).level, 1);
  assert.equal(pressureFromFailStreak(2, { level: 0, hint: "" }).level, 2);
  assert.equal(pressureFromFailStreak(3, { level: 0, hint: "" }).level, 3);
  // 取 max(base, streak)
  assert.equal(pressureFromFailStreak(1, { level: 3, hint: "" }).level, 3);
});
