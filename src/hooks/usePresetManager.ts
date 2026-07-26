import { useEffect, useRef, useState } from "react";
import { postJSON } from "../lib/api";
import { useAppStore } from "../store/useAppStore";
import { API_ROUTES } from "../../shared/contracts.js";
import {
  patchFromLore,
  lorePayloadFromSettings,
  sanitizeLorePayload,
  sanitizeFileName,
  stripFileExt
} from "../lib/loreHelpers";
import { readFileAsText, parseJSONLoose } from "../lib/fileHelpers";
import type { LorePayload } from "../types";

export function usePresetManager() {
  const settings = useAppStore((s) => s.settings);
  const presets = useAppStore((s) => s.presets);

  const {
    setStatus,
    updateSetting,
    updateSettings,
    savePreset,
    loadPresetById,
    deletePresetById
  } = useAppStore.getState();

  const [presetName, setPresetName] = useState("");
  const [presetId, setPresetId] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Auto-select first preset when none selected
  useEffect(() => {
    if (!presetId && presets.length) {
      setPresetId(presets[0].id);
      setPresetName(presets[0].name);
    }
  }, [presets, presetId]);

  /* ── Internal helpers ── */

  const applyLorePayload = (payload: Partial<LorePayload>) => {
    const patch = patchFromLore(payload);
    if (Object.keys(patch).length) updateSettings(patch);
    return patch;
  };

  /* ── Effects ── */
  const lastFetchedConfig = useRef({ baseUrl: "", apiKey: "" });

  useEffect(() => {
    const { baseUrl, apiKey } = settings;
    if (baseUrl && apiKey) {
      if (baseUrl !== lastFetchedConfig.current.baseUrl || apiKey !== lastFetchedConfig.current.apiKey) {
        const timer = setTimeout(() => {
          void handleLoadModels();
        }, 1200);
        return () => clearTimeout(timer);
      }
    }
  }, [settings.baseUrl, settings.apiKey]);

  /* ── Models ── */

  const handleLoadModels = async () => {
    const { baseUrl, apiKey } = settings;
    
    // 如果是手动点击，且没填配置，给个明确提示
    if (!baseUrl || !apiKey) {
      setStatus("请先填写 Base URL 和 API Key 以获取模型列表。", "error");
      return;
    }

    setIsLoadingModels(true);
    setStatus("正在拉取模型列表...", "pending");
    try {
      const res = await postJSON<{ models: string[] }>(API_ROUTES.models, {
        llmConfig: { baseUrl, apiKey }
      });
      const list = Array.isArray(res.models) ? res.models : [];
      setModels(list);
      
      // 只有在当前没有选中模型，且列表有值时，才自动选第一个
      if (!settings.model && list.length > 0) {
        updateSetting("model", list[0]);
      }
      
      lastFetchedConfig.current = { baseUrl, apiKey };
      setStatus(list.length > 0 ? `模型列表已更新（${list.length} 个）` : "已连接但未获取到模型列表", "ok");
    } catch (error) {
      setStatus(`模型列表拉取失败：${String((error as Error).message || error)}`, "error");
    } finally {
      setIsLoadingModels(false);
    }
  };

  /* ── CRUD ── */

  const handleSavePreset = () => {
    const result = savePreset(presetName, lorePayloadFromSettings(settings));
    setStatus(result.message, result.ok ? "ok" : "error");
    if (result.ok) setPresetName("");
  };

  const handleUpdateCurrentPreset = () => {
    const preset = loadPresetById(presetId);
    if (!preset) {
      setStatus("请先选择要更新的预设。", "error");
      return;
    }
    const result = savePreset(preset.name, lorePayloadFromSettings(settings));
    setStatus(result.ok ? `已更新预设：${preset.name}` : result.message, result.ok ? "ok" : "error");
    if (result.ok) {
      setPresetName(preset.name);
    }
  };

  const handleLoadPreset = () => {
    const preset = loadPresetById(presetId);
    if (!preset) {
      setStatus("未找到预设。", "error");
      return;
    }
    applyLorePayload(preset.data);
    setPresetName(preset.name);
    setStatus(`预设已加载：${preset.name}`, "ok");
  };

  const handleDeletePreset = () => {
    const target = presets.find((p) => p.id === presetId);
    if (!target) return;
    if (!window.confirm(`确认删除预设「${target.name}」？此操作不可撤销。`)) return;
    const result = deletePresetById(presetId);
    if (result.ok) {
      // 复位选中项，让自动选择 effect 挑选下一个可用预设，避免悬空 id
      setPresetId("");
      setPresetName("");
    }
    setStatus(result.message, result.ok ? "ok" : "error");
  };

  /* ── Import / Export ── */

  const handleExportLore = () => {
    const payload = lorePayloadFromSettings(settings);
    const fileName = `${sanitizeFileName(payload.worldName)}.json`;
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setStatus("剧本设定已导出（不含模型配置）。", "ok");
  };

  const handleImportLore = async (file?: File) => {
    if (!file) return;
    if (file.size <= 0) {
      setStatus("设定导入失败：文件为空，请重新导出或检查文件内容。", "error");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    let text = "";
    let parsed: unknown;

    try {
      text = await readFileAsText(file);
    } catch (error) {
      const message = String((error as Error).message || error);
      const hint = /not readable|could not be read|permission|failed to fetch/i.test(message)
        ? "。请将文件先下载/另存到本地磁盘后再导入（不要直接从网盘或聊天软件临时文件导入）。"
        : "";
      setStatus(`设定导入失败：文件读取失败（${message}）${hint}`, "error");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    try {
      parsed = parseJSONLoose(text);
    } catch (error) {
      setStatus(`设定导入失败：JSON 解析错误（${String((error as Error).message || error)}）`, "error");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    try {
      const fallback = useAppStore.getState().settings;

      // format A: { name, data }
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        "data" in parsed &&
        typeof (parsed as { data: unknown }).data === "object" &&
        (parsed as { data: unknown }).data !== null
      ) {
        const name =
          (parsed as { name?: string }).name ||
          ((parsed as { data: Partial<LorePayload> }).data.worldName || stripFileExt(file.name));
        const data = (parsed as { data: Partial<LorePayload> }).data;
        const sanitized = sanitizeLorePayload(data, fallback);
        const result = savePreset(name, sanitized);
        applyLorePayload(sanitized);
        setStatus(result.ok ? `预设导入成功：${name}` : result.message, result.ok ? "ok" : "error");
        return;
      }

      // format B: { presets: [{ name, data }, ...] }
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        "presets" in parsed &&
        Array.isArray((parsed as { presets: unknown[] }).presets)
      ) {
        const items = (parsed as { presets: Array<{ name?: string; data?: Partial<LorePayload> }> }).presets;
        let imported = 0;
        for (const item of items) {
          if (!item?.data || typeof item.data !== "object") continue;
          const name = item.name || item.data.worldName || `导入预设-${imported + 1}`;
          const sanitized = sanitizeLorePayload(item.data, fallback);
          const result = savePreset(name, sanitized);
          if (result.ok) imported += 1;
        }
        if (imported > 0) {
          const firstData = items.find((i) => i?.data)?.data;
          if (firstData) applyLorePayload(sanitizeLorePayload(firstData, fallback));
          setStatus(`批量导入成功：${imported} 个预设`, "ok");
          return;
        }
      }

      // format C: single lore payload
      if (typeof parsed === "object" && parsed !== null) {
        const data = parsed as Partial<LorePayload>;
        const name = data.worldName || stripFileExt(file.name);
        const sanitized = sanitizeLorePayload(data, fallback);
        const result = savePreset(name, sanitized);
        applyLorePayload(sanitized);
        setStatus(result.ok ? `设定导入成功并写入剧本列表：${name}` : result.message, result.ok ? "ok" : "error");
        return;
      }

      setStatus("设定导入失败：文件结构不支持。", "error");
    } catch (error) {
      setStatus(`设定导入失败：${String((error as Error).message || error)}`, "error");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return {
    // state
    presetName,
    setPresetName,
    presetId,
    setPresetId,
    models,
    isLoadingModels,
    fileInputRef,
    // passthrough
    updateSetting,
    // actions
    handleLoadModels,
    handleSavePreset,
    handleUpdateCurrentPreset,
    handleLoadPreset,
    handleDeletePreset,
    handleExportLore,
    handleImportLore
  } as const;
}
