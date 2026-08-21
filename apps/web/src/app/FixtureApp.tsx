import { FixtureRendezvousApi } from "../demo/fixtures.js";
import { useEffect, useRef, useState } from "react";
import { AppProviders } from "./providers.js";
import { AppRouter } from "./router.js";
import { useTranslation } from "react-i18next";

export default function FixtureApp() {
  const [api] = useState(() => new FixtureRendezvousApi());
  const { t } = useTranslation();
  const shellRef = useRef<HTMLDivElement>(null);
  const bannerRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const shell = shellRef.current;
    const banner = bannerRef.current;
    if (!shell || !banner || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      shell.style.setProperty(
        "--fixture-banner-height",
        `${banner.offsetHeight}px`,
      );
    });
    observer.observe(banner);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="fixture-shell" ref={shellRef}>
      <p className="fixture-banner" role="status" ref={bannerRef}>
        <strong>{t("demo.bannerTitle")}</strong>
        <span>{t("demo.bannerDescription")}</span>
      </p>
      <AppProviders api={api}>
        <AppRouter />
      </AppProviders>
    </div>
  );
}
