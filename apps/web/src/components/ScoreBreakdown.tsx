import type { ScoreBreakdown as Scores } from "@rendezvous/contracts";
import { useTranslation } from "react-i18next";

const labelKeys: Record<keyof Scores, string> = {
  together: "score.together",
  cost: "score.cost",
  travel: "score.travel",
  synchronization: "score.synchronization",
  fairness: "score.fairness",
};

export function ScoreBreakdown({
  scores,
  compact = false,
}: {
  scores: Scores;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div
      className={`score-breakdown ${compact ? "score-breakdown--compact" : ""}`}
    >
      {(Object.keys(labelKeys) as Array<keyof Scores>).map((key) => (
        <div className="score-row" key={key}>
          <span>{t(labelKeys[key])}</span>
          <div
            className="score-track"
            role="progressbar"
            aria-label={t(labelKeys[key])}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(scores[key])}
          >
            <i aria-hidden="true" style={{ width: `${scores[key]}%` }} />
          </div>
          <strong>{Math.round(scores[key])}</strong>
        </div>
      ))}
    </div>
  );
}
