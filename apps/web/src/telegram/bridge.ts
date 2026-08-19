type TelegramWebApp = {
  initData?: string;
  initDataUnsafe?: { start_param?: string };
  ready?: () => void;
  expand?: () => void;
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export function initializeTelegramBridge(): void {
  window.Telegram?.WebApp?.ready?.();
  window.Telegram?.WebApp?.expand?.();
}

export function telegramInitData(): string | null {
  return window.Telegram?.WebApp?.initData?.trim() || null;
}

export function applyTelegramStartParam(): void {
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
