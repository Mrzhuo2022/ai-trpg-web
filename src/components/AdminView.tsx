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

export function AdminView({
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
  return (
    <main className="admin-wrap">
      <header className="admin-header">
        <h1>管理端</h1>
        <button className="btn" onClick={onNavigate}>返回用户端</button>
      </header>

      <section className="admin-panel">
        <h2>模型配置（全局）</h2>
        <p className="hint-note">Base URL / API Key / 模型为全局设置，不随剧本导入导出。</p>
        <div className="row row-3">
          <label>Base URL
            <input value={settings.baseUrl} onChange={(e) => onUpdateSetting("baseUrl", e.target.value)} />
          </label>
          <label>API Key
            <input type="password" value={settings.apiKey} onChange={(e) => onUpdateSetting("apiKey", e.target.value)} />
          </label>
          <label>模型
            <input value={settings.model} onChange={(e) => onUpdateSetting("model", e.target.value)} />
          </label>
        </div>
        <div className="inline">
          <button className="btn" onClick={onLoadModels} disabled={isLoadingModels}>
            {isLoadingModels ? "拉取中..." : "自动获取模型"}
          </button>
          <select value={models.includes(settings.model) ? settings.model : ""} onChange={(e) => onUpdateSetting("model", e.target.value)}>
            <option value="">从列表选择模型</option>
            {models.map((model) => (
              <option key={model} value={model}>{model}</option>
            ))}
          </select>
        </div>
      </section>

      <section className="admin-panel">
        <h2>剧本设定</h2>
        <div className="row row-3">
          <label>世界标题
            <input value={settings.worldName} onChange={(e) => onUpdateSetting("worldName", e.target.value)} />
          </label>
          <label>规则体系
            <input value={settings.ruleset} onChange={(e) => onUpdateSetting("ruleset", e.target.value)} />
          </label>
          <label>角色名
            <input value={settings.characterName} onChange={(e) => onUpdateSetting("characterName", e.target.value)} />
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
        <h2>预设管理</h2>
        <div className="row row-3">
          <label>预设名称
            <input value={presetName} onChange={(e) => onSetPresetName(e.target.value)} placeholder="例如：港口阴谋" />
          </label>
          <label>已存预设
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
              {presets.length === 0 ? <option value="">暂无预设</option> : null}
              {presets.map((preset) => (
                <option key={preset.id} value={preset.id}>{preset.name}</option>
              ))}
            </select>
          </label>
          <label>操作
            <div className="inline">
              <button className="btn" onClick={onSavePreset}>另存为</button>
              <button className="btn" onClick={onUpdateCurrentPreset}>更新选中</button>
              <button className="btn" onClick={onLoadPreset}>加载</button>
              <button className="btn btn-danger" onClick={onDeletePreset}>删除</button>
            </div>
          </label>
        </div>

        <div className="inline">
          <button className="btn" onClick={() => fileInputRef.current?.click()}>导入预设 JSON</button>
          <button className="btn" onClick={onExportLore}>导出当前剧本设定</button>
          <input
            ref={fileInputRef}
            type="file"
            hidden
            accept="application/json"
            onChange={(e) => void onImportLore(e.target.files?.[0])}
          />
        </div>

        <div className={`status ${status.type}`}>状态：{status.text}</div>
      </section>
    </main>
  );
}
