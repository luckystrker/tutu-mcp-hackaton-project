import type { SupportedLocale } from "@rendezvous/i18n";

const TITLES_BY_MONTH: Record<
  SupportedLocale,
  ReadonlyArray<ReadonlyArray<string>>
> = {
  en: [
    ["January escape", "Winter getaway", "New Year reset"],
    ["February break", "Winter weekend", "Snowy route"],
    ["March weekend", "Spring escape", "Farewell to winter"],
    ["April journey", "Spring rendezvous", "First warmth"],
    ["May discoveries", "Spring getaway", "May voyage"],
    ["June kickoff", "Summer start", "Sunny weekend"],
    ["July holidays", "Peak summer", "Hot route"],
    ["August voyage", "Summer finale", "Warm weekend"],
    ["September escape", "Velvet season", "Quiet September"],
    ["October comfort", "Autumn route", "Golden autumn"],
    ["November pause", "Autumn rendezvous", "Early winter voyage"],
    ["December kaleidoscope", "Winter tale", "New Year prelude"],
  ],
  ru: [
    ["Январские каникулы", "Зимний побег", "Новогодний рефреш"],
    ["Февральская передышка", "Зимний уикенд", "Снежный маршрут"],
    ["Мартовский уикенд", "Весенняя вылазка", "Прощай, зима"],
    ["Апрельские мотивы", "Весенний рандеву", "Первое тепло"],
    ["Майские открытия", "Весенний побег", "Майский вояж"],
    ["Июньский старт лета", "Летний разбег", "Солнечный уикенд"],
    ["Июльские каникулы", "Летний максимум", "Горячий маршрут"],
    ["Августовский вояж", "Летний финиш", "Тёплый уикенд"],
    ["Сентябрьский побег", "Бархатный сезон", "Тихий сентябрь"],
    ["Октябрьский уют", "Осенний маршрут", "Золотая осень"],
    ["Ноябрьская пауза", "Осенний рандеву", "Предзимний вояж"],
    ["Декабрьский калейдоскоп", "Зимняя сказка", "Новогодняя прелюдия"],
  ],
};

const TIME_FLAVORS: Record<
  SupportedLocale,
  ReadonlyArray<{ from: number; to: number; titles: readonly string[] }>
> = {
  en: [
    { from: 6, to: 11, titles: ["Morning start", "Coffee and train"] },
    { from: 11, to: 17, titles: ["Day rendezvous", "Easy route"] },
    { from: 17, to: 23, titles: ["Evening escape", "Night express"] },
  ],
  ru: [
    { from: 6, to: 11, titles: ["Утренний старт", "Кофе и поезд"] },
    { from: 11, to: 17, titles: ["Дневной рандеву", "Лёгкий маршрут"] },
    { from: 17, to: 23, titles: ["Вечерний побег", "Ночной экспресс"] },
  ],
};

export function randomTripTitle(
  now: Date,
  locale: SupportedLocale = "en",
): string {
  const pool = [...TITLES_BY_MONTH[locale][now.getMonth()]!];
  const hour = now.getHours();
  const flavor = TIME_FLAVORS[locale].find(
    ({ from, to }) => hour >= from && hour < to,
  );
  if (flavor) pool.push(...flavor.titles);
  const index = Math.floor(Math.random() * pool.length);
  return pool[index]!;
}
