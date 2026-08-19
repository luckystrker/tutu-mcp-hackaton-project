import { useEffect, useState } from "react";
import type { Readiness } from "@rendezvous/contracts";
import { getReadiness } from "../lib/api/health.js";

export function App() {
  const [readiness, setReadiness] = useState<Readiness | null>(null);

  useEffect(() => {
    let active = true;
    void getReadiness()
      .then((result) => {
        if (active) setReadiness(result);
      })
      .catch(() => {
        if (active)
          setReadiness({
            status: "unavailable",
            dependencies: { database: "unavailable" },
          });
      });
    return () => {
      active = false;
    };
  }, []);

  const ready = readiness?.status === "ok";
  return (
    <main className="shell">
      <p className="eyebrow">Telegram Mini App</p>
      <h1>Rendezvous</h1>
      <p className="thesis">Место, которое вашей компании стоило выбрать.</p>
      <div
        className={`status ${ready ? "status--ready" : ""}`}
        aria-live="polite"
      >
        <span aria-hidden="true" />
        {readiness === null
          ? "Проверяем сервис…"
          : ready
            ? "Сервис готов"
            : "Сервис временно недоступен"}
      </div>
    </main>
  );
}
