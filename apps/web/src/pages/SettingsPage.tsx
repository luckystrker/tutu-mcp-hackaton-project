import type { SupportedLocale } from "@rendezvous/i18n";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AppFrame } from "../components/AppFrame.js";
import { formatDateTime } from "../lib/formatting.js";
import { currentLocale, setLocale } from "../i18n/index.js";

const OPTIONS: ReadonlyArray<{
  value: SupportedLocale;
  label: "settings.english" | "settings.russian";
  code: string;
}> = [
  { value: "en", label: "settings.english", code: "EN" },
  { value: "ru", label: "settings.russian", code: "RU" },
];

export function SettingsPage() {
  const { t } = useTranslation();
  const [selected, setSelected] = useState(currentLocale);
  const [announcement, setAnnouncement] = useState("");
  const buildSha = import.meta.env.VITE_BUILD_SHA || "development";
  const buildTime = import.meta.env.VITE_BUILD_TIME
    ? formatDateTime(import.meta.env.VITE_BUILD_TIME)
    : "—";

  async function select(locale: SupportedLocale) {
    setSelected(locale);
    await setLocale(locale);
    setAnnouncement(t("settings.saved"));
  }

  return (
    <AppFrame title={t("settings.title")} back>
      <main className="settings-page">
        <header className="settings-intro">
          <h1>{t("settings.heading")}</h1>
          <p className="lead">{t("settings.description")}</p>
        </header>
        <fieldset className="language-settings">
          <legend>{t("settings.language")}</legend>
          <p>{t("settings.languageHint")}</p>
          <div className="language-options">
            {OPTIONS.map((option) => (
              <label
                className={selected === option.value ? "is-selected" : ""}
                key={option.value}
              >
                <input
                  type="radio"
                  name="language"
                  value={option.value}
                  checked={selected === option.value}
                  onChange={() => void select(option.value)}
                />
                <span aria-hidden="true">{option.code}</span>
                <strong>{t(option.label)}</strong>
                <i aria-hidden="true">✓</i>
              </label>
            ))}
          </div>
        </fieldset>
        <section className="build-diagnostics" aria-labelledby="build-heading">
          <h2 id="build-heading">{t("settings.diagnostics")}</h2>
          <dl>
            <div>
              <dt>{t("settings.build")}</dt>
              <dd>{buildSha.slice(0, 12)}</dd>
            </div>
            <div>
              <dt>{t("settings.builtAt")}</dt>
              <dd>{buildTime}</dd>
            </div>
          </dl>
        </section>
        <p className="sr-only" aria-live="polite">
          {announcement}
        </p>
      </main>
    </AppFrame>
  );
}
