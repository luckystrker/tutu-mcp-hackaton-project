import type { ComputeStatus } from "@rendezvous/contracts";

export function ComputeBanner({
  status,
  hasPrevious,
}: {
  status: ComputeStatus;
  hasPrevious: boolean;
}) {
  if (status === "idle") return null;
  const content = {
    running: [
      "Пересчитываем маршрут",
      hasPrevious
        ? "Пока показываем предыдущий результат"
        : "Обычно это занимает меньше минуты",
    ],
    degraded: [
      "Некоторые варианты транспорта временно недоступны",
      "Рейтинг собран из доступных маршрутов — проверим остальные позже",
    ],
    failed: [
      "Расчёт не завершён",
      "Ваши условия сохранены — попробуйте обновить позже",
    ],
  }[status];
  return (
    <aside className={`compute-banner compute-banner--${status}`} role="status">
      <span className="compute-banner__pulse" aria-hidden="true" />
      <div>
        <strong>{content[0]}</strong>
        <small>{content[1]}</small>
      </div>
    </aside>
  );
}
