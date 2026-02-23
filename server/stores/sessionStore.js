export function createSessionStore({ sessionTtlMs, maxSessions, maxSessionMessages, sessionSweepIntervalMs }) {
  const sessions = new Map();

  function sessionLastActiveAt(session) {
    if (!session || typeof session !== "object") return 0;
    if (typeof session.lastActiveAt === "number") return session.lastActiveAt;
    if (typeof session.createdAt === "number") return session.createdAt;
    return 0;
  }

  function isExpired(session, now = Date.now()) {
    return now - sessionLastActiveAt(session) > sessionTtlMs;
  }

  function cleanupExpired(now = Date.now()) {
    let removed = 0;
    for (const [id, session] of sessions.entries()) {
      if (isExpired(session, now)) {
        sessions.delete(id);
        removed += 1;
      }
    }
    return removed;
  }

  function enforceLimit() {
    if (sessions.size <= maxSessions) return 0;

    const sorted = Array.from(sessions.entries()).sort((a, b) => sessionLastActiveAt(a[1]) - sessionLastActiveAt(b[1]));
    let removed = 0;
    while (sessions.size > maxSessions && sorted.length) {
      const [oldestId] = sorted.shift();
      sessions.delete(oldestId);
      removed += 1;
    }
    return removed;
  }

  function touch(session) {
    if (!session || typeof session !== "object") return;
    session.lastActiveAt = Date.now();
  }

  function trimMessages(messages) {
    if (!Array.isArray(messages) || messages.length <= maxSessionMessages) return messages;
    const [systemMessage, ...rest] = messages;
    return [systemMessage, ...rest.slice(-(maxSessionMessages - 1))];
  }

  function create({ sessionId, llmConfig, systemPrompt, finalReply }) {
    const now = Date.now();
    sessions.set(sessionId, {
      createdAt: now,
      lastActiveAt: now,
      llmConfig,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "assistant", content: finalReply }
      ]
    });
    enforceLimit();
  }

  function get(sessionId) {
    return sessions.get(sessionId);
  }

  function remove(sessionId) {
    sessions.delete(sessionId);
  }

  function sweep() {
    cleanupExpired();
    enforceLimit();
  }

  const timer = setInterval(sweep, sessionSweepIntervalMs);
  timer.unref?.();

  return {
    get,
    create,
    remove,
    touch,
    trimMessages,
    cleanupExpired,
    enforceLimit,
    isExpired
  };
}
