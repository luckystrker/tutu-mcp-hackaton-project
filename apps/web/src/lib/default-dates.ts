export type DaysOff = { from: Date; to: Date };

/**
 * Fixed-date public holidays per country (ISO 3166-1 alpha-2), best-effort
 * snapshot from public sources. Weekday transfers are intentionally not
 * modelled: only stable recurring dates are listed.
 */
const PUBLIC_HOLIDAYS: Readonly<Record<string, ReadonlyArray<string>>> = {
  RU: [
    "01-01",
    "01-02",
    "01-03",
    "01-04",
    "01-05",
    "01-06",
    "01-07",
    "01-08",
    "02-23",
    "03-08",
    "05-01",
    "05-09",
    "06-12",
    "11-04",
  ],
  BY: [
    "01-01",
    "01-02",
    "01-07",
    "03-08",
    "05-01",
    "05-09",
    "07-03",
    "11-07",
    "12-25",
  ],
  KZ: [
    "01-01",
    "01-02",
    "03-07",
    "03-08",
    "03-21",
    "03-22",
    "03-23",
    "05-01",
    "05-07",
    "05-09",
    "07-06",
    "08-30",
    "10-25",
    "12-16",
  ],
  GE: [
    "01-01",
    "01-02",
    "01-07",
    "01-19",
    "03-03",
    "03-08",
    "04-09",
    "05-01",
    "05-09",
    "05-26",
    "08-28",
    "10-14",
    "11-23",
  ],
  AM: [
    "01-01",
    "01-02",
    "01-06",
    "01-28",
    "03-08",
    "04-07",
    "04-24",
    "05-01",
    "05-09",
    "05-28",
    "07-05",
    "09-21",
    "12-31",
  ],
  AZ: [
    "01-01",
    "01-02",
    "01-20",
    "03-08",
    "03-20",
    "03-21",
    "03-22",
    "05-28",
    "06-15",
    "06-26",
    "11-09",
    "12-31",
  ],
  UZ: [
    "01-01",
    "03-08",
    "03-21",
    "03-22",
    "03-23",
    "05-09",
    "09-01",
    "10-01",
    "12-08",
  ],
  KG: [
    "01-01",
    "01-07",
    "02-23",
    "03-08",
    "03-21",
    "03-22",
    "03-23",
    "05-05",
    "05-09",
    "08-31",
    "11-07",
  ],
  TJ: ["01-01", "03-08", "03-21", "03-22", "03-23", "05-09", "09-09", "11-06"],
  MD: ["01-01", "01-07", "01-08", "03-08", "05-01", "05-09", "08-27", "08-31"],
};

/** Weekend days per country as getDay() indexes (0=Sun, 6=Sat). */
const WEEKENDS: Readonly<Record<string, readonly number[]>> = {
  AE: [5, 6],
  IL: [5, 6],
  IR: [4, 5],
};

const DEFAULT_WEEKEND: readonly number[] = [6, 0];
const DAY_MS = 86_400_000;

export function weekendDaysFor(country: string): readonly number[] {
  return WEEKENDS[country.toUpperCase()] ?? DEFAULT_WEEKEND;
}

function monthDay(date: Date): string {
  return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

export function isPublicHoliday(
  date: Date,
  country: string,
  holidays: Readonly<Record<string, ReadonlyArray<string>>> = PUBLIC_HOLIDAYS,
): boolean {
  return (holidays[country.toUpperCase()] ?? []).includes(monthDay(date));
}

export function isDayOff(
  date: Date,
  country: string,
  holidays: Readonly<Record<string, ReadonlyArray<string>>> = PUBLIC_HOLIDAYS,
): boolean {
  return (
    weekendDaysFor(country).includes(date.getDay()) ||
    isPublicHoliday(date, country, holidays)
  );
}

/**
 * Returns the nearest upcoming days-off window in the user's country: the
 * closest Sat–Sun block, extended by adjacent public holidays (or starting at
 * a holiday when it comes first). If today already is a day off, the current
 * block is returned.
 */
export function nextDaysOff(
  now: Date,
  country: string,
  holidays: Readonly<Record<string, ReadonlyArray<string>>> = PUBLIC_HOLIDAYS,
  horizonDays = 60,
): DaysOff {
  const normalizedCountry = country.toUpperCase();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let blockStart: Date | undefined;
  for (let offset = 0; offset <= horizonDays; offset += 1) {
    const day = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() + offset,
    );
    if (isDayOff(day, normalizedCountry, holidays)) {
      blockStart ??= day;
    } else if (blockStart) {
      return {
        from: blockStart,
        to: new Date(day.getFullYear(), day.getMonth(), day.getDate() - 1),
      };
    }
  }
  if (blockStart) return { from: blockStart, to: blockStart };
  const upcoming = weekendDaysFor(normalizedCountry).map((weekday) => {
    const delta = (weekday - now.getDay() + 7) % 7 || 7;
    return new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() + delta,
    );
  });
  upcoming.sort((left, right) => left.getTime() - right.getTime());
  const first = upcoming[0]!;
  return { from: first, to: new Date(first.getTime() + DAY_MS) };
}

/** Value for <input type="datetime-local"> in the user's local time. */
export function toDateTimeLocalValue(date: Date): string {
  const local = new Date(date.valueOf() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
