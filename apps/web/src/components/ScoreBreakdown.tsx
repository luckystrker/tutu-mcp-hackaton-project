import type { ScoreBreakdown as Scores } from "@rendezvous/contracts";

const labels: Record<keyof Scores, string> = {
  together: "Время вместе",
  cost: "Стоимость",
  travel: "Дорога",
  synchronization: "Синхронность",
  fairness: "Справедливость",
};

export function ScoreBreakdown({
  scores,
  compact = false,
}: {
  scores: Scores;
  compact?: boolean;
}) {
  return (
    <div
      className={`score-breakdown ${compact ? "score-breakdown--compact" : ""}`}
    >
      {(Object.keys(labels) as Array<keyof Scores>).map((key) => (
        <div className="score-row" key={key}>
          <span>{labels[key]}</span>
          <div
            className="score-track"
            role="progressbar"
            aria-label={labels[key]}
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
