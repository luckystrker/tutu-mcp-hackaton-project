import { CITY_CATALOG } from "@rendezvous/domain";
import { findNearestCity } from "./geolocation.js";

const TIMEZONE_COUNTRIES: Readonly<Record<string, string>> = {
  "Europe/Moscow": "RU",
  "Europe/Kaliningrad": "RU",
  "Europe/Samara": "RU",
  "Asia/Yekaterinburg": "RU",
  "Asia/Omsk": "RU",
  "Asia/Novosibirsk": "RU",
  "Asia/Krasnoyarsk": "RU",
  "Asia/Irkutsk": "RU",
  "Asia/Yakutsk": "RU",
  "Asia/Vladivostok": "RU",
  "Asia/Magadan": "RU",
  "Asia/Kamchatka": "RU",
  "Europe/Minsk": "BY",
  "Asia/Almaty": "KZ",
  "Asia/Aqtobe": "KZ",
  "Asia/Atyrau": "KZ",
  "Asia/Oral": "KZ",
  "Asia/Qostanay": "KZ",
  "Asia/Tbilisi": "GE",
  "Asia/Yerevan": "AM",
  "Asia/Baku": "AZ",
  "Asia/Tashkent": "UZ",
  "Asia/Samarkand": "UZ",
  "Asia/Bishkek": "KG",
  "Asia/Dushanbe": "TJ",
  "Europe/Chisinau": "MD",
};

function countryFromTimezone(): string | undefined {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return TIMEZONE_COUNTRIES[timezone];
}

function countryFromLanguage(): string | undefined {
  for (const language of navigator.languages ?? [navigator.language]) {
    const region = language.match(/[-_]([A-Za-z]{2})$/)?.[1]?.toUpperCase();
    if (region) return region;
  }
  return undefined;
}

function currentPosition(timeoutMs: number): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Geolocation unavailable"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      timeout: timeoutMs,
      maximumAge: 600_000,
    });
  });
}

async function positionPermissionGranted(): Promise<boolean> {
  try {
    if (!("permissions" in navigator)) return false;
    const status = await navigator.permissions.query({
      name: "geolocation" as PermissionName,
    });
    return status.state === "granted";
  } catch {
    return false;
  }
}

/** Synchronous country guess from timezone and UI languages. */
export function guessCountryCode(): string {
  return countryFromTimezone() ?? countryFromLanguage() ?? "RU";
}

/**
 * Best-effort country detection for weekend defaults. Exact coordinates are
 * only read when the user has already granted the geolocation permission, so
 * no permission prompt appears on its own. Coordinates are matched against the
 * local city catalog only and never leave the browser.
 */
export async function detectCountryCode(timeoutMs = 3_000): Promise<string> {
  if (await positionPermissionGranted()) {
    try {
      const position = await currentPosition(timeoutMs);
      const nearest = findNearestCity(CITY_CATALOG, {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
      if (nearest) return nearest.city.country;
    } catch {
      // fall through to timezone/language heuristics
    }
  }
  return guessCountryCode();
}
