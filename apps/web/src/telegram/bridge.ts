type TelegramWebApp = {
  initData?: string;
  initDataUnsafe?: {
    start_param?: string;
    user?: { language_code?: string };
  };
  ready?: () => void;
  expand?: () => void;
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export function initializeTelegramBridge(): void {
  if (typeof window === "undefined") return;
  window.Telegram?.WebApp?.ready?.();
  window.Telegram?.WebApp?.expand?.();
}

export function telegramInitData(): string | null {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp?.initData?.trim() || null;
}

export function telegramLanguageCode(): string | null {
  if (typeof window === "undefined") return null;
  return (
    window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code?.trim() || null
  );
}

export function applyTelegramStartParam(): void {
  if (typeof window === "undefined") return;
  const startParam =
    window.Telegram?.WebApp?.initDataUnsafe?.start_param?.trim();
  if (!startParam) return;
  const { pathname } = window.location;
  if (pathname !== "/" && pathname !== "/index.html") return;
  window.history.replaceState(
    null,
    "",
    `/join/${encodeURIComponent(startParam)}`,
  );
}
