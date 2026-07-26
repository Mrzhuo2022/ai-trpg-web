/**
 * 极简内存滑动窗口限流：每 IP 每分钟最多 N 次请求。
 * 用于 /api/game/* 与 /api/models（每次请求都会消耗上游 LLM 配额）。
 */
export function createRateLimiter({ maxPerMinute, windowMs = 60_000 }) {
  const hits = new Map(); // ip -> number[]（时间戳）

  // 定期清理过期条目，防止 Map 无限增长
  const sweep = setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [ip, stamps] of hits.entries()) {
      const alive = stamps.filter((t) => t > cutoff);
      if (alive.length) hits.set(ip, alive);
      else hits.delete(ip);
    }
  }, windowMs);
  sweep.unref?.();

  return function rateLimit(req, res, next) {
    const ip = req.socket?.remoteAddress || "unknown";
    const now = Date.now();
    const cutoff = now - windowMs;
    const stamps = (hits.get(ip) || []).filter((t) => t > cutoff);

    if (stamps.length >= maxPerMinute) {
      res.setHeader("Retry-After", Math.ceil(windowMs / 1000));
      return res.status(429).json({
        error: `请求过于频繁，请稍后再试（每分钟上限 ${maxPerMinute} 次）。`
      });
    }

    stamps.push(now);
    hits.set(ip, stamps);
    next();
  };
}
