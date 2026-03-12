import { memo, useState } from "react";
import type { MutableRefObject } from "react";
import type { AppStatus, Preset, Settings } from "../types";

export interface AdminViewProps {
  settings: Settings;
  presets: Preset[];
  models: string[];
  status: AppStatus;
  presetName: string;
  presetId: string;
  isLoadingModels: boolean;
  fileInputRef: MutableRefObject<HTMLInputElement | null>;
  onUpdateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  onNavigate: () => void;
  onSetPresetName: (name: string) => void;
  onSetPresetId: (id: string) => void;
  onLoadModels: () => void;
  onSavePreset: () => void;
  onUpdateCurrentPreset: () => void;
  onLoadPreset: () => void;
  onDeletePreset: () => void;
  onExportLore: () => void;
  onImportLore: (file?: File) => void;
}

export const AdminView = memo(function AdminView({
  settings,
  presets,
  models,
  status,
  presetName,
  presetId,
  isLoadingModels,
  fileInputRef,
  onUpdateSetting,
  onNavigate,
  onSetPresetName,
  onSetPresetId,
  onLoadModels,
  onSavePreset,
  onUpdateCurrentPreset,
  onLoadPreset,
  onDeletePreset,
  onExportLore,
  onImportLore
}: AdminViewProps) {
  const [showApiKey, setShowApiKey] = useState(false);

  return (
    <main className="admin-wrap">
      <header className="admin-header">
        <h1>管理端</h1>
        <div className="header-actions">
          <button className="btn" onClick={onNavigate}>返回用户端</button>
        </div>
      </header>

      <div className={`status-banner ${status.type}`}>
        <div className="status-indicator" />
        <span className="label">SYSTEM STATUS:</span>
        <span className="status-text">{status.text}</span>
      </div>

      <section className="admin-panel">
        <div className="panel-header">
          <h2>核心连接配置</h2>
          <p className="hint-note">Base URL / API Key 为全局设置，建议从官方获取。</p>
        </div>
        <div className="row row-2">
          <label>Base URL
            <input value={settings.baseUrl} onChange={(e) => onUpdateSetting("baseUrl", e.target.value)} placeholder="https://api.openai.com/v1" />
          </label>
          <label>API Key
            <div className="input-with-action">
              <input
                type={showApiKey ? "text" : "password"}
                value={settings.apiKey}
                onChange={(e) => onUpdateSetting("apiKey", e.target.value)}
                placeholder="sk-..."
              />
              <button
                type="button"
                className="icon-btn input-action-btn"
                onClick={() => setShowApiKey(!showApiKey)}
                title={showApiKey ? "隐藏" : "显示"}
              >
                {showApiKey ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>
          </label>
        </div>
        <div className="row row-1">
          <label>模型选择
            <div className="input-combo">
              <input
                value={settings.model}
                onChange={(e) => onUpdateSetting("model", e.target.value)}
                placeholder="直接输入或从右侧列表选择"
              />
              <select
                className="model-select"
                value={models.includes(settings.model) ? settings.model : ""}
                onChange={(e) => {
                  if (e.target.value) onUpdateSetting("model", e.target.value);
                }}
              >
                <option value="">-- 选择已拉取的模型 --</option>
                {models.map((model) => (
                  <option key={model} value={model} title={model}>{model}</option>
                ))}
              </select>
              <button className="btn btn-sm" onClick={onLoadModels} disabled={isLoadingModels}>
                {isLoadingModels ? "拉取中..." : "刷新列表"}
              </button>
            </div>
          </label>
        </div>
      </section>

      <section className="admin-panel">
        <div className="panel-header">
          <h2>剧本设定</h2>
          <p className="hint-note">当前正在编辑的剧本详情。</p>
        </div>
        <div className="row row-3">
          <label>世界标题
            <input value={settings.worldName} onChange={(e) => onUpdateSetting("worldName", e.target.value)} placeholder="例如：遗忘之都" />
          </label>
          <label>规则体系
            <input value={settings.ruleset} onChange={(e) => onUpdateSetting("ruleset", e.target.value)} placeholder="例如：D&D 5E" />
          </label>
          <label>角色名
            <input value={settings.characterName} onChange={(e) => onUpdateSetting("characterName", e.target.value)} placeholder="你的角色名字" />
          </label>
        </div>

        <label>角色设定
          <textarea rows={3} value={settings.characterProfile} onChange={(e) => onUpdateSetting("characterProfile", e.target.value)} />
        </label>

        <label>世界观
          <textarea rows={5} value={settings.worldbook} onChange={(e) => onUpdateSetting("worldbook", e.target.value)} />
        </label>

        <label>剧本/开场线索
          <textarea rows={5} value={settings.scenarioScript} onChange={(e) => onUpdateSetting("scenarioScript", e.target.value)} />
        </label>

        <label>主持人系统词
          <textarea rows={10} value={settings.gmPrompt} onChange={(e) => onUpdateSetting("gmPrompt", e.target.value)} />
        </label>
      </section>

      <section className="admin-panel">
        <div className="panel-header">
          <h2>预设管理</h2>
          <p className="hint-note">保存或加载整套剧本设定。</p>
        </div>
        <div className="row row-2">
          <label>预设操作名称
            <input value={presetName} onChange={(e) => onSetPresetName(e.target.value)} placeholder="输入新预设名称" />
          </label>
          <label>选择已有预设
            <select
              value={presetId}
              onChange={(e) => {
                const nextId = e.target.value;
                onSetPresetId(nextId);
                const selected = presets.find((p) => p.id === nextId);
                if (selected) {
                  onSetPresetName(selected.name);
                }
              }}
            >
              <option value="">-- 请选择预设 --</option>
              {presets.map((preset) => (
                <option key={preset.id} value={preset.id}>{preset.name}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="panel-footer">
          <div className="inline">
            <button className="btn btn-primary" onClick={onSavePreset} disabled={!presetName.trim()}>另存为</button>
            <button className="btn" onClick={onUpdateCurrentPreset} disabled={!presetId}>更新选中</button>
            <button className="btn" onClick={onLoadPreset} disabled={!presetId}>加载剧本</button>
            <button className="btn btn-danger" onClick={onDeletePreset} disabled={!presetId}>删除</button>
          </div>
          <div className="divider-v" />
          <div className="inline">
            <button className="btn" onClick={() => fileInputRef.current?.click()}>导入 JSON</button>
            <button className="btn" onClick={onExportLore}>导出 JSON</button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            hidden
            accept="application/json"
            onChange={(e) => void onImportLore(e.target.files?.[0])}
          />
        </div>
      </section>
    </main>
  );
});
