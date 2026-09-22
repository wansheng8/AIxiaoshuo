import type { AigcReport } from "../../domain/types";

export function aigcLevelText(level: AigcReport["level"]) {
  if (level === "high") return "偏AI";
  if (level === "mid") return "有套话";
  return "人味够";
}

export default function AigcCard({
  report,
  onDeai,
  issueCount = 0,
}: {
  report: AigcReport | null;
  onDeai?: () => void;
  issueCount?: number;
}) {
  if (!report || report.chars < 80) return null;
  return (
    <div className={`aigc-card ${report.level}`}>
      <div className="aigc-head">
        <b>AI率 {report.rate}</b>
        <span>{aigcLevelText(report.level)}</span>
      </div>
      <div className="aigc-track">
        <i style={{ width: `${Math.max(0, Math.min(100, report.rate))}%` }} />
      </div>
      {report.reasons.slice(0, 4).map((row) => (
        <p className="aigc-reason" key={row.id}>
          {row.label}
          {row.count ? `（${row.count}处）` : ""} · {row.note}
        </p>
      ))}
      <p className="aigc-scope">
        只测 AI 套话与句式，不代表没有错字、专名或标点问题
        {issueCount > 0 ? `；另有 ${issueCount} 条校对待看` : ""}
      </p>
      {report.level !== "low" && onDeai ? (
        <button type="button" className="btn" onClick={onDeai}>
          去AI味
        </button>
      ) : null}
    </div>
  );
}
