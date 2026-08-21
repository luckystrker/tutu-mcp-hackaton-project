import type { ComputeStatus } from "@rendezvous/contracts";
import { useTranslation } from "react-i18next";

export function ComputeBanner({
  status,
  hasPrevious,
}: {
  status: ComputeStatus;
  hasPrevious: boolean;
}) {
  const { t } = useTranslation();
  if (status === "idle") return null;
  const content = {
    running: [
      t("compute.running.title"),
      hasPrevious ? t("compute.running.previous") : t("compute.running.fresh"),
    ],
    degraded: [t("compute.degraded.title"), t("compute.degraded.description")],
    failed: [t("compute.failed.title"), t("compute.failed.description")],
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
