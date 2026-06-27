import { memo } from "react";
import { roleLabel } from "../lib/parseHelpers";
import { NarrativeView } from "./NarrativeView";

export interface StoryMessageProps {
  id: string;
  role: string;
  content: string;
}

/**
 * 单条叙事消息。用 memo 隔离：流式追加最后一条消息时，
 * 前面的历史消息因 content 不变会被 React.memo 跳过，避免全量重渲染。
 */
export const StoryMessage = memo(function StoryMessage({ role, content }: StoryMessageProps) {
  return (
    <div className={`story-msg ${role}`}>
      {role !== "assistant" ? <div className="story-role">{roleLabel(role)}</div> : null}
      <div className="story-content">
        {role === "assistant" ? <NarrativeView content={content} /> : content}
      </div>
    </div>
  );
}, (prev, next) => {
  // 自定义比较：role 和 content 都不变才跳过
  return prev.role === next.role && prev.content === next.content;
});
