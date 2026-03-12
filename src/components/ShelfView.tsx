import { memo } from "react";
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
  onNavigateToAdmin: () => void;
}

export const ShelfView = memo(function ShelfView({
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
  onConfirmCareerAndStart,
  onNavigateToAdmin
}: ShelfViewProps) {
  return (
    <section className="shelf-zone">
      <header className="shelf-header">
        <h2 className="shelf-title">选择剧本</h2>
        <button className="icon-btn" onClick={onNavigateToAdmin} title="设置">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        </button>
      </header>
      {presets.length === 0 ? (
        <div className="empty-note">暂无可用剧本。请先到 `/admin` 创建或导入剧本预设。</div>
      ) : (
        <div className="book-wall">
          {presets.map((preset) => {
            const session = latestSessionByPresetId.get(preset.id);
            const hasProgress = Boolean(session?.messages.length);
            const isEnded = session?.isEnded === true;
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
                {hasProgress ? (
                  isEnded ? (
                    <span className="book-progress book-ended">已完结</span>
                  ) : (
                    <span className="book-progress">已保存进度</span>
                  )
                ) : null}
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
                  {isStarting
                    ? "开启中..."
                    : isEnded
                      ? "重新开始"
                      : hasProgress
                        ? "继续游玩"
                        : shouldAskCareer
                          ? "选择职业"
                          : "进入剧本"}
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
});
