import type { ScanIssue } from "../../domain/types";

export function issueKindLabel(kind: ScanIssue["kind"]) {
  if (kind === "name") return "专名";
  if (kind === "emotion") return "情感";
  if (kind === "ai") return "套话";
  return "错字";
}

export default function IssueList({
  issues,
  onJump,
  onApply,
  onFeel,
  onIgnore,
}: {
  issues: ScanIssue[];
  onJump: (issue: ScanIssue) => void;
  onApply: (issue: ScanIssue) => void;
  onFeel: (issue: ScanIssue) => void;
  onIgnore: (id: string) => void;
}) {
  return (
    <>
      {issues.map((issue) => (
        <div key={issue.id} className={`issue-line ${issue.kind}`}>
          <button type="button" onClick={() => onJump(issue)}>
            {issueKindLabel(issue.kind)} · {issue.original} → {issue.suggest}
          </button>
          {issue.kind === "emotion" ? (
            <button type="button" className="btn-ghost" onClick={() => onFeel(issue)}>
              增强
            </button>
          ) : (
            <button type="button" className="btn-ghost" onClick={() => onApply(issue)}>
              接受
            </button>
          )}
          <button type="button" className="btn-ghost" onClick={() => onIgnore(issue.id)}>
            忽略
          </button>
        </div>
      ))}
    </>
  );
}
