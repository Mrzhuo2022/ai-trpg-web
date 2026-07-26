export function createSessionStore({ sessionTtlMs, maxSessions, maxSessionMessages, sessionSweepIntervalMs, initialLuckPoints = 3 }) {
  const sessions = new Map();
  const safeInitialLuck = Math.max(0, Math.floor(Number(initialLuckPoints) || 3));

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

  /**
   * 消息裁剪 + 启发式摘要保底（不调 LLM）
   * - 始终保留 system（index 0）和最近 maxSessionMessages-1 条
   * - 当被裁掉的早期消息较多时，从它们中抽取关键事实（NPC、物品、转折），
   *   追加到 system 末尾，避免长会话丢失世界观与伏笔
   */
  const SUMMARY_HEADER = "【剧情纲要（自动抽取）】";

  function trimMessages(messages) {
    if (!Array.isArray(messages) || messages.length <= maxSessionMessages) return messages;

    const [systemMessage, ...rest] = messages;
    const keepCount = maxSessionMessages - 1;
    const dropped = rest.slice(0, rest.length - keepCount);
    const kept = rest.slice(-keepCount);

    const summary = summarizeDropped(dropped);
    if (!summary) return [systemMessage, ...kept];

    // 替换而非追加：把旧纲要段落剥离后与新纲要合并去重，
    // 避免长会话反复裁剪导致 system 消息无限膨胀
    const content = String(systemMessage.content || "");
    const headerIdx = content.indexOf(`\n\n${SUMMARY_HEADER}`);
    const baseContent = headerIdx === -1 ? content : content.slice(0, headerIdx);
    const oldSummary = headerIdx === -1 ? "" : content.slice(headerIdx).replace(`\n\n${SUMMARY_HEADER}\n`, "").trim();
    const mergedFacts = Array.from(new Set([...oldSummary.split("；"), ...summary.split("；")].map((s) => s.trim()).filter(Boolean)));
    // 上限保护：最多保留 12 条事实
    const finalSummary = mergedFacts.slice(-12).join("；");

    const newSystem = { ...systemMessage, content: `${baseContent}\n\n${SUMMARY_HEADER}\n${finalSummary}` };
    return [newSystem, ...kept];
  }

  function summarizeDropped(dropped) {
    if (!Array.isArray(dropped) || dropped.length < 3) return "";

    const text = dropped
      .filter((m) => m && typeof m.content === "string")
      .map((m) => m.content)
      .join("\n");

    const facts = [];

    // NPC 提取（通用模式，不依赖具体剧本）：
    // ①「引号内的短名」 ② X说/道/喊（2-4 字中文名+说话动词） ③ 名叫/自称 X
    const npcCandidates = [];
    for (const m of text.matchAll(/[「『"]([\u4e00-\u9fa5·]{2,6})[」』"]/g)) npcCandidates.push(m[1]);
    for (const m of text.matchAll(/([\u4e00-\u9fa5·]{2,4})(?:说道|说|喊道|低声道|答道|回道)[:：]/g)) npcCandidates.push(m[1]);
    for (const m of text.matchAll(/(?:名叫|自称|叫做)\s*([\u4e00-\u9fa5·]{2,6})/g)) npcCandidates.push(m[1]);
    if (npcCandidates.length) {
      // 至少出现 2 次的才算稳定 NPC，降低误报
      const counts = new Map();
      for (const name of npcCandidates) counts.set(name, (counts.get(name) || 0) + 1);
      const unique = Array.from(counts.entries())
        .filter(([, n]) => n >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([name]) => name);
      if (unique.length) facts.push(`已遇 NPC：${unique.join("、")}`);
    }

    // 物品/资源提取
    const itemPatterns = [
      { re: /(以太滤芯|滤芯)\s*[x×]?\s*(\d+)/gi, label: "滤芯" },
      { re: /(弹药|弹匣|子弹)\s*[x×]?\s*(\d+)/gi, label: "弹药" },
      { re: /(医疗包|急救包)\s*[x×]?\s*(\d+)/gi, label: "医疗包" },
      { re: /(腐化度|感染值)\s*[:：]?\s*(\d+)/gi, label: "腐化度" }
    ];
    const items = [];
    for (const p of itemPatterns) {
      const m = text.match(p.re);
      if (m && m.length) {
        const last = m[m.length - 1];
        const num = last.match(/(\d+)/);
        if (num) items.push(`${p.label}${num[1]}`);
      }
    }
    if (items.length) facts.push(`关键资源：${items.join("、")}`);

    // 关键转折（成败/伤亡/获得）
    if (/大成功|轻松成功/.test(text)) facts.push("曾有亮眼表现");
    if (/大失败|明显失败|重伤|阵亡|撕卡/.test(text)) facts.push("曾遭受重大挫折");
    if (/获得|入手|拿到|找到了/.test(text)) facts.push("获得了关键物品或情报");

    return facts.length ? facts.join("；") : "";
  }

  function create({ sessionId, llmConfig, systemPrompt, initialUserMessage, finalReply, characterState }) {
    const now = Date.now();
    sessions.set(sessionId, {
      createdAt: now,
      lastActiveAt: now,
      llmConfig,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: initialUserMessage },
        { role: "assistant", content: finalReply }
      ],
      luckPoints: safeInitialLuck,
      maxLuckPoints: safeInitialLuck,
      rollHistory: [],
      pressure: { level: 0, hint: "局势平稳，可以谨慎推进。" },
      failStreak: 0,
      characterState: characterState || null
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
    isExpired,
    get initialLuckPoints() {
      return safeInitialLuck;
    }
  };
}
