import { test } from "node:test";
import assert from "node:assert/strict";
import {
  abilityModifier,
  createCharacterState,
  applyDamage,
  heal,
  addCorruption,
  reduceCorruption,
  addResource,
  removeResource,
  addCondition,
  removeCondition,
  summarizeState
} from "../server/characterState.js";

test("abilityModifier: 标准 D&D 5e 调整值公式", () => {
  assert.equal(abilityModifier(10), 0);
  assert.equal(abilityModifier(11), 0);
  assert.equal(abilityModifier(12), 1);
  assert.equal(abilityModifier(16), 3);
  assert.equal(abilityModifier(20), 5);
  assert.equal(abilityModifier(8), -1);
  assert.equal(abilityModifier(3), -4);
  // 5e 官方：属性 1 对应 -5（floor((1-10)/2) = floor(-4.5) = -5）
  assert.equal(abilityModifier(1), -5);
  assert.equal(abilityModifier(2), -4);
});

test("abilityModifier: 非法输入兜底为 10（调整值 0）", () => {
  assert.equal(abilityModifier(NaN), 0);
  assert.equal(abilityModifier(undefined), 0);
  assert.equal(abilityModifier("abc"), 0);
});

test("createCharacterState: 完整初始化", () => {
  const s = createCharacterState({
    attributes: { str: 16, dex: 14, con: 13, int: 11, wis: 12, cha: 10 },
    baseHp: 20,
    baseAc: 14,
    corruptionName: "腐化",
    corruptionMax: 100,
    corruptionThreshold: 70,
    initialResources: [{ name: "滤芯", qty: 3 }, { name: "弹药", qty: 6 }]
  });
  assert.equal(s.hp.current, 20);
  assert.equal(s.hp.max, 20);
  assert.equal(s.hp.temp, 0);
  assert.equal(s.ac, 14);
  assert.equal(s.attributes.str, 16);
  assert.equal(s.attributes.dex, 14);
  assert.equal(s.corruption.name, "腐化");
  assert.equal(s.corruption.current, 0);
  assert.equal(s.corruption.threshold, 70);
  assert.equal(s.resources.length, 2);
  assert.equal(s.resources[0].name, "滤芯");
  assert.equal(s.resources[0].qty, 3);
});

test("createCharacterState: 缺省属性默认为 10，HP 按 CON 推导", () => {
  const s = createCharacterState({ attributes: { con: 14 } });
  assert.equal(s.attributes.str, 10);
  assert.equal(s.attributes.con, 14);
  // 10 + CON(14→+2) = 12
  assert.equal(s.hp.max, 12);
  assert.equal(s.hp.current, 12);
});

test("createCharacterState: 属性钳制在 3-20", () => {
  const s = createCharacterState({ attributes: { str: 999, dex: -5 } });
  assert.equal(s.attributes.str, 20);
  assert.equal(s.attributes.dex, 3);
});

test("applyDamage: 先扣临时 HP 再扣本体", () => {
  const s = createCharacterState({ attributes: {}, baseHp: 20 });
  const withTemp = { ...s, hp: { ...s.hp, temp: 5 } };
  const after = applyDamage(withTemp, 8);
  assert.equal(after.hp.temp, 0);
  assert.equal(after.hp.current, 17); // 8-5=3 扣本体
});

test("applyDamage: 不扣负数", () => {
  const s = createCharacterState({ attributes: {}, baseHp: 10 });
  const after = applyDamage(s, 999);
  assert.equal(after.hp.current, 0);
});

test("applyDamage: HP 归零触发 downed 状态", () => {
  const s = createCharacterState({ attributes: {}, baseHp: 10 });
  const after = applyDamage(s, 10);
  assert.ok(after.conditions.includes("downed"));
});

test("applyDamage: 不重复加 downed", () => {
  const s = createCharacterState({ attributes: {}, baseHp: 10 });
  const downed = addCondition(s, "downed");
  const after = applyDamage(downed, 5);
  const downedCount = after.conditions.filter((c) => c === "downed").length;
  assert.equal(downedCount, 1);
});

test("heal: 不超过 maxHp，且移除 downed", () => {
  const s = createCharacterState({ attributes: {}, baseHp: 20 });
  const hurt = applyDamage(s, 15);
  assert.equal(hurt.hp.current, 5);
  const healed = heal(hurt, 30);
  assert.equal(healed.hp.current, 20);
  assert.ok(!healed.conditions.includes("downed"));
});

test("addCorruption: 超阈值触发 corrupted", () => {
  const s = createCharacterState({ attributes: {}, corruptionMax: 100, corruptionThreshold: 70 });
  const after = addCorruption(s, 75);
  assert.equal(after.corruption.current, 75);
  assert.ok(after.conditions.includes("corrupted"));
});

test("reduceCorruption: 低于阈值移除 corrupted", () => {
  const s = createCharacterState({ attributes: {}, corruptionMax: 100, corruptionThreshold: 70 });
  const corrupted = addCorruption(s, 80);
  assert.ok(corrupted.conditions.includes("corrupted"));
  const clean = reduceCorruption(corrupted, 30);
  assert.equal(clean.corruption.current, 50);
  assert.ok(!clean.conditions.includes("corrupted"));
});

test("addResource: 同名累加，新名新增", () => {
  const s = createCharacterState({ attributes: {}, initialResources: [{ name: "弹药", qty: 6 }] });
  const after = addResource(s, "弹药", 4);
  assert.equal(after.resources.find((r) => r.name === "弹药").qty, 10);
  const after2 = addResource(after, "绷带", 2);
  assert.ok(after2.resources.find((r) => r.name === "绷带"));
});

test("removeResource: 数量足够则扣减，不足则失败不变", () => {
  const s = createCharacterState({ attributes: {}, initialResources: [{ name: "弹药", qty: 6 }] });
  const r1 = removeResource(s, "弹药", 4);
  assert.equal(r1.ok, true);
  assert.equal(r1.state.resources.find((x) => x.name === "弹药").qty, 2);

  const r2 = removeResource(r1.state, "弹药", 999);
  assert.equal(r2.ok, false);
  assert.equal(r2.state.resources.find((x) => x.name === "弹药").qty, 2);

  const r3 = removeResource(s, "不存在", 1);
  assert.equal(r3.ok, false);
});

test("removeResource: 扣到 0 则从清单移除", () => {
  const s = createCharacterState({ attributes: {}, initialResources: [{ name: "钥匙", qty: 1 }] });
  const r = removeResource(s, "钥匙", 1);
  assert.equal(r.ok, true);
  assert.equal(r.state.resources.find((x) => x.name === "钥匙"), undefined);
});

test("addCondition / removeCondition", () => {
  let s = createCharacterState({ attributes: {} });
  s = addCondition(s, "bleeding");
  assert.ok(s.conditions.includes("bleeding"));
  // 不重复加
  s = addCondition(s, "bleeding");
  assert.equal(s.conditions.filter((c) => c === "bleeding").length, 1);
  s = removeCondition(s, "bleeding");
  assert.ok(!s.conditions.includes("bleeding"));
});

test("summarizeState: 输出含 HP/AC/属性调整/腐化/物品", () => {
  const s = createCharacterState({
    attributes: { str: 16, dex: 14, con: 13, int: 11, wis: 12, cha: 10 },
    baseHp: 20,
    baseAc: 14,
    initialResources: [{ name: "滤芯", qty: 3 }]
  });
  const summary = summarizeState(s, { pressureLevel: 2 });
  assert.match(summary, /HP 20\/20/);
  assert.match(summary, /AC 14/);
  assert.match(summary, /STR\+3/);
  assert.match(summary, /DEX\+2/);
  assert.match(summary, /滤芯×3/);
  assert.match(summary, /局势压力：危急/);
});

test("纯函数不可变性：原 state 不被修改", () => {
  const s = createCharacterState({ attributes: {}, baseHp: 20 });
  const original = JSON.stringify(s);
  applyDamage(s, 5);
  addCorruption(s, 10);
  addResource(s, "x", 1);
  assert.equal(JSON.stringify(s), original);
});
