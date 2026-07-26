import { lookup } from "node:dns/promises";
import net from "node:net";
import { SERVER_CONFIG } from "./config.js";

function isPrivateIPv4(ip) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4) return true;
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true; // link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

function isPrivateIPv6(ip) {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) return true;
  // IPv4-mapped, e.g. ::ffff:127.0.0.1
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return false;
}

function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  if (net.isIPv6(ip)) return isPrivateIPv6(ip);
  return true;
}

/**
 * Validates a user-supplied LLM baseUrl before the server fetches it.
 * - Protocol must be http/https.
 * - When the server is exposed beyond loopback (HOST != 127.0.0.1/localhost),
 *   private/loopback/link-local targets are rejected to prevent SSRF.
 *   Local single-user setups keep working with local model servers (ollama etc.).
 */
export async function assertSafeBaseUrl(baseUrl) {
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error("baseUrl 不是合法的 URL。");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("baseUrl 仅支持 http/https 协议。");
  }

  const allowPrivate =
    process.env.ALLOW_PRIVATE_BASE_URL === "1" ||
    SERVER_CONFIG.host === "127.0.0.1" ||
    SERVER_CONFIG.host === "localhost";
  if (allowPrivate) return;

  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  let addresses = [];
  if (net.isIP(hostname)) {
    addresses = [hostname];
  } else {
    try {
      const results = await lookup(hostname, { all: true });
      addresses = results.map((r) => r.address);
    } catch {
      throw new Error("baseUrl 域名无法解析。");
    }
  }

  if (!addresses.length || addresses.some((addr) => isPrivateAddress(addr))) {
    throw new Error("baseUrl 指向内网/保留地址，已被拒绝。如确需访问，请设置 ALLOW_PRIVATE_BASE_URL=1。");
  }
}
