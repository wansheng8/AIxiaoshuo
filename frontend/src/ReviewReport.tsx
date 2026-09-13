import { useState } from "react";
import {
  fixCanReplace,
  fixIsDelete,
  looksLikeReview,
  parseReviewFixes,
  parseReviewSections,
  parseReviewVerdict,
  verdictClass,
  type ReviewFix,
} from "./review";

type Props = {
  text: string;
  chapterText?: string;
  onLocate?: (original: string) => void;
  onReplace?: (original: string, replacement: string) => void;
};

function FixItem({
  item,
  chapterText,
  onLocate,
  onReplace,
}: {
  item: ReviewFix;
  chapterText: string;
  onLocate?: (original: string) => void;
  onReplace?: (original: string, replacement: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(item.fix);
  const canReplace = fixCanReplace(item, chapterText);
  const isDelete = fixIsDelete(item.fix);
  const found = Boolean(item.original) && chapterText.includes(item.original);

  return (
    <li className="rev-fix">
      <b>
        {item.index}. {item.location || "改稿项"}
      </b>
      {item.problem ? <p className="rev-fix-problem">{item.problem}</p> : null}
      {item.fix ? <p className="rev-fix-fix">改法：{item.fix}</p> : null}
      <div className="rev-fix-actions">
        {item.original ? (
          <button type="button" className="btn-ghost" disabled={!found} onClick={() => onLocate?.(item.original)}>
            定位
          </button>
        ) : null}
        {canReplace ? (
          isDelete ? (
            <button type="button" className="btn-ghost" onClick={() => onReplace?.(item.original, "")}>
              删除
            </button>
          ) : (
            <button type="button" className="btn-ghost" onClick={() => setOpen(true)}>
              替换…
            </button>
          )
        ) : null}
      </div>
      {open ? (
        <div className="rev-fix-confirm">
          <p className="muted">原文：{item.original}</p>
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} />
          <div className="row-actions">
            <button
              className="btn"
              type="button"
              onClick={() => {
                onReplace?.(item.original, draft);
                setOpen(false);
              }}
            >
              确定替换
            </button>
            <button className="btn-ghost" type="button" onClick={() => setOpen(false)}>
              取消
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

export default function ReviewReport({ text, chapterText = "", onLocate, onReplace }: Props) {
  if (!looksLikeReview(text)) return <pre className="side-result">{text}</pre>;
  const sections = parseReviewSections(text);
  const fixes = parseReviewFixes(text);
  const verdict = parseReviewVerdict(text);
  return (
    <div className="rev-report">
      {verdict ? <div className={`rev-badge ${verdictClass(verdict)}`}>{verdict}</div> : null}
      {sections.map((sec) => (
        <article className="rev-card" key={sec.title}>
          <b>{sec.title}</b>
          {sec.title === "改稿清单" && fixes.length ? (
            <ol className="rev-fix-list">
              {fixes.map((item) => (
                <FixItem key={item.index} item={item} chapterText={chapterText} onLocate={onLocate} onReplace={onReplace} />
              ))}
            </ol>
          ) : (
            <p>{sec.body}</p>
          )}
        </article>
      ))}
    </div>
  );
}
