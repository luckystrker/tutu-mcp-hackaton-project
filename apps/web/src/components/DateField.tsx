import { useState, type ChangeEvent } from "react";
import {
  formatDateInput,
  formatTime,
  parseDateInput,
} from "../lib/formatting.js";

/**
 * Free-form date/datetime input shown as dd.mm.yyyy (hh:mm). Submits an ISO
 * string through a hidden input so native datetime-local rendering (which
 * follows the OS locale) never leaks mm.dd.yyyy.
 *
 * When the default value already carries a meaningful time (e.g. saved
 * constraints), that time is preserved; otherwise the field falls back to
 * defaultTime (used for weekend defaults computed at local midnight).
 */
export function DateField({
  name,
  defaultValue,
  defaultTime = "10:00",
  required = false,
  ariaLabel,
}: {
  name: string;
  defaultValue?: string | null;
  defaultTime?: string;
  required?: boolean;
  ariaLabel?: string;
}) {
  const [initialText] = useState(() => {
    if (!defaultValue) return "";
    const parsed = parseDateInput(defaultValue);
    if (!parsed) return "";
    const hasOwnTime = parsed.getHours() !== 0 || parsed.getMinutes() !== 0;
    return formatDateInput(
      parsed,
      hasOwnTime ? formatTime(parsed) : defaultTime,
    );
  });
  const [text, setText] = useState(initialText);
  const parsed = text.trim() ? parseDateInput(text, defaultTime) : null;
  const iso = parsed ? parsed.toISOString() : "";
  const invalid = Boolean(text.trim()) && !parsed;
  return (
    <>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="дд.мм.гггг чч:мм"
        maxLength={16}
        value={text}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        onChange={(event: ChangeEvent<HTMLInputElement>) =>
          setText(event.target.value)
        }
        style={invalid ? { borderColor: "#ad3528" } : undefined}
      />
      <input
        type="hidden"
        name={name}
        value={iso}
        required={required}
        readOnly
      />
    </>
  );
}
