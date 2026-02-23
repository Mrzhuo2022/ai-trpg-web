import { previewText } from "../lib/loreHelpers";
import type { CareerOption } from "../lib/loreHelpers";
import type { Preset, Session } from "../types";

export interface ShelfViewProps {
  presets: Preset[];
  isStarting: boolean;
  latestSessionByPresetId: Map<string, Session>;
  careerOptionsByPresetId: Map<string, CareerOption[]>;
  careerPickerPreset: Preset | null;
  careerPickerOptions: CareerOption[];
  selectedCareerName: string;
  onStartFromShelf: (preset: Preset) => void;
  onOpenCareerPicker: (preset: Preset) => void;
  onSetSelectedCareerName: (name: string) => void;
  onCancelCareerPicker: () => void;
  onConfirmCareerAndStart: () => void;
}

export function ShelfView({
  presets,
  isStarting,
  latestSessionByPresetId,
  careerOptionsByPresetId,
  careerPickerPreset,
  careerPickerOptions,
  selectedCareerName,
  onStartFromShelf,
  onOpenCareerPicker,
  onSetSelectedCareerName,
  onCancelCareerPicker,
  onConfirmCareerAndStart
}: ShelfViewProps) {
  return (
    <section className="shelf-zone">
      <h2 className="shelf-title">选择剧本</h2>
      {presets.length === 0 ? (
        <div className="empty-note">暂无可用剧本。请先到 `/admin` 创建或导入剧本预设。</div>
      ) : (
        <div className="book-wall">
          {presets.map((preset) => {
            const hasProgress = Boolean(latestSessionByPresetId.get(preset.id)?.messages.length);
            const careerOptions = careerOptionsByPresetId.get(preset.id) || [];
            const shouldAskCareer =
              !hasProgress &&
              careerOptions.length > 0 &&
              /(待定|未定|可选职业)/.test(`${preset.data.characterName || ""}${preset.data.characterProfile || ""}`);
            return (
              <article key={preset.id} className="book-cover">
                <h3>{preset.name}</h3>
                <p>{preset.data.worldName || "未命名世界"}</p>
                <p className="book-desc">{previewText(preset.data.scenarioScript || preset.data.worldbook || "")}</p>
                <small>{preset.data.ruleset || "通用规则"}</small>
                {hasProgress ? <span className="book-progress">已保存进度</span> : null}
                <button
                  className="btn btn-primary"
                  disabled={isStarting}
                  onClick={() => {
                    if (shouldAskCareer) {
                      onOpenCareerPicker(preset);
                      return;
                    }
                    onStartFromShelf(preset);
                  }}
                >
                  {isStarting ? "开启中..." : hasProgress ? "继续游玩" : shouldAskCareer ? "选择职业" : "进入剧本"}
                </button>
              </article>
            );
          })}
        </div>
      )}
      {careerPickerPreset ? (
        <div className="career-modal-mask" role="dialog" aria-modal="true" aria-labelledby="career-picker-title">
          <div className="career-modal">
            <h3 id="career-picker-title">选择职业</h3>
            <p className="career-modal-sub">
              {careerPickerPreset.name} · {careerPickerPreset.data.worldName || "未命名世界"}
            </p>
            <div className="career-option-list">
              {careerPickerOptions.map((option) => (
                <button
                  key={option.name}
                  className={`career-option ${selectedCareerName === option.name ? "active" : ""}`}
                  onClick={() => onSetSelectedCareerName(option.name)}
                >
                  <strong>{option.name}</strong>
                  {option.summary ? <span>{option.summary}</span> : null}
                </button>
              ))}
            </div>
            <div className="inline right">
              <button className="btn" onClick={onCancelCareerPicker}>
                取消
              </button>
              <button className="btn btn-primary" onClick={onConfirmCareerAndStart}>
                确认并开场
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
