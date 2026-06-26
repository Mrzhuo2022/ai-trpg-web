import { test } from "node:test";
import assert from "node:assert/strict";
import { obfuscate, deobfuscate, isObfuscated } from "../src/lib/credential.ts";

test("obfuscate/deobfuscate: 往返还原", () => {
  const cases = ["sk-abc123xyz", "key-with-中文", "a", "", "sk-proj-9f8e7d6c5b4a3210"];
  for (const c of cases) {
    const ob = obfuscate(c);
    if (c === "") {
      assert.equal(ob, "");
    } else {
      assert.notEqual(ob, c, `${c} 混淆后不应等于原文`);
      assert.equal(deobfuscate(ob), c, `${c} 还原失败`);
    }
  }
});

test("isObfuscated: 正确识别混淆格式", () => {
  assert.equal(isObfuscated(obfuscate("sk-test")), true);
  assert.equal(isObfuscated("sk-plain-key"), false);
  assert.equal(isObfuscated(""), false);
});

test("deobfuscate: 向后兼容明文（旧数据）", () => {
  // 旧版明文 key 不带前缀，应原样返回
  assert.equal(deobfuscate("sk-legacy-key"), "sk-legacy-key");
});

test("deobfuscate: 损坏数据返回空", () => {
  assert.equal(deobfuscate("obf1:!!!invalid-base64!!!"), "");
});

test("obfuscate: 不可被肉眼识别", () => {
  const plain = "sk-secret-12345";
  const ob = obfuscate(plain);
  assert.ok(!ob.includes("sk-secret"), "混淆结果不应含原文片段");
  assert.ok(!ob.includes("12345"), "混淆结果不应含原文数字");
});
