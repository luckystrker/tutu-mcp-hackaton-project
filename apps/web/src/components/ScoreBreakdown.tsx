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
          <div className="score-track">
            <i style={{ width: `${scores[key]}%` }} />
          </div>
          <strong>{Math.round(scores[key])}</strong>
        </div>
      ))}
    </div>
  );
}
