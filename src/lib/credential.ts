/**
 * 轻量凭证混淆
 *
 * 注意：这不是真正的加密。localStorage 中的 apiKey 用 XOR + base64 混淆，
 * 目的是避免明文裸露在 localStorage（防 console 直接窥探 / 简单 XSS 读取），
 * 以及在导出预设/存档时不再带出 apiKey。
 *
 * 真正的安全需要后端代管 Key，但那需要账号体系，当前单人本地应用暂不引入。
 *
 * 实现要点：UTF-8 编码成字节后再 XOR，避免多字节字符（如中文 key）在
 * btoa/atob 下出错。
 */

const OBF_PREFIX = "obf1:";
// 固定混淆种子（够挡住肉眼和简单脚本，不必每次随机以便持久化）
const SEED = "ai-trpg-2026";

function strToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

function bytesToStr(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function xorBytes(data: Uint8Array, keyBytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    out[i] = data[i] ^ keyBytes[i % keyBytes.length];
  }
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const g = globalThis as unknown as { btoa?: (s: string) => string; Buffer?: { from: (s: string, enc: string) => { toString: (enc: string) => string } } };
  if (typeof g.btoa === "function") return g.btoa(bin);
  if (g.Buffer) return g.Buffer.from(bin, "binary").toString("base64");
  return encodeURIComponent(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const g = globalThis as unknown as { atob?: (s: string) => string; Buffer?: { from: (s: string, enc: string) => Uint8Array } };
  let bin: string;
  if (typeof g.atob === "function") bin = g.atob(b64);
  else if (g.Buffer) {
    const buf = g.Buffer.from(b64, "base64");
    bin = "";
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  } else {
    bin = decodeURIComponent(b64);
  }
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** 混淆一个明文凭证（如 apiKey） */
export function obfuscate(plain: string): string {
  if (!plain) return "";
  try {
    const data = strToBytes(plain);
    const key = strToBytes(SEED);
    const xored = xorBytes(data, key);
    return OBF_PREFIX + bytesToBase64(xored);
  } catch {
    return "";
  }
}

/** 还原一个被 obfuscate 处理过的凭证；非混淆格式原样返回（向后兼容旧数据） */
export function deobfuscate(stored: string): string {
  if (!stored) return "";
  if (!stored.startsWith(OBF_PREFIX)) return stored; // 旧版明文，兼容
  try {
    const b64 = stored.slice(OBF_PREFIX.length);
    const xored = base64ToBytes(b64);
    const key = strToBytes(SEED);
    return bytesToStr(xorBytes(xored, key));
  } catch {
    return "";
  }
}

/** 是否为已混淆格式 */
export function isObfuscated(stored: string): boolean {
  return Boolean(stored) && stored.startsWith(OBF_PREFIX);
}
