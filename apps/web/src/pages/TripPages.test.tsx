// @vitest-environment jsdom
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { AppProviders } from "../app/providers.js";
import { DEMO_TRIP_IDS, FixtureRendezvousApi } from "../demo/fixtures.js";
import i18n from "../i18n/index.js";
import {
  FinalTripPage,
  ComparePage,
  CreateTripPage,
  DestinationPage,
  InvitePage,
  LiveRoomPage,
  PreferencesPage,
  ShortlistPage,
  StartPage,
  TripsPage,
} from "./TripPages.js";

beforeAll(() => i18n.changeLanguage("ru"));
afterEach(cleanup);
afterAll(() => i18n.changeLanguage("en"));

describe("core trip pages", () => {
  it(
    "keeps previous ranking visible while recompute is running",
    { timeout: 10_000 },
    async () => {
      renderLive(DEMO_TRIP_IDS.running);
      expect(await screen.findByText("Пересчитываем маршрут")).toBeTruthy();
      expect(
        screen.getByText("Предварительный результат · 2 из 4"),
      ).toBeTruthy();
      expect(screen.getAllByText("Казань").length).toBeGreaterThan(0);
      expect(
        screen.getByText("Пока показываем предыдущий результат"),
      ).toBeTruthy();
      expect(
        await screen.findByText(
          "После ответа участника Катя вариант «Ярославль» стал более сбалансированным.",
          {},
          { timeout: 8000 },
        ),
      ).toBeTruthy();
      expect(document.querySelector(".score-change")).toBeTruthy();
    },
  );

  it("exposes all common trip controls without requiring a period", async () => {
    renderPage("/new", <Route path="/new" element={<CreateTripPage />} />);
    expect(screen.getByText("Сколько нас?")).toBeTruthy();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    expect(screen.getByLabelText("Хотим провести вместе, часов")).toBeTruthy();
    expect(
      screen.getByLabelText("Можно искать встречу за границей"),
    ).toBeTruthy();
    expect(screen.getByLabelText("Поезд")).toBeTruthy();
  });

  it("offers geolocation, a map and the full city catalog for the origin", async () => {
    const id = DEMO_TRIP_IDS.live;
    renderPage(
      `/trips/${id}/me`,
      <Route path="/trips/:tripId/me" element={<PreferencesPage />} />,
    );
    expect(await screen.findByText("Откуда ты едешь")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Моё место/ })).toBeTruthy();
    expect(
      screen.getByRole("application", { name: /Карта городов/ }),
    ).toBeTruthy();
    expect(
      within(
        screen.getByRole("combobox", { name: "Город списком" }),
      ).getAllByRole("option").length,
    ).toBeGreaterThanOrEqual(100);
  });

  it("changes fixture ranking from a preset without a global loading screen", async () => {
    const user = userEvent.setup();
    renderLive(DEMO_TRIP_IDS.live);
    await screen.findByText("Ваш топ-3");
    await user.click(screen.getByText("Что для вас важнее?"));
    await user.click(screen.getByRole("button", { name: "Подешевле" }));
    expect(screen.queryByText("Собираем поездку…")).toBeNull();
    await waitFor(() => {
      const cards = document.querySelectorAll(".city-card h3");
      expect(cards[0]?.textContent).toBe("Нижний Новгород");
    });
    expect(document.querySelector(".score-change")).toBeTruthy();
  });

  it("does not render another participant's private constraints", async () => {
    renderLive(DEMO_TRIP_IDS.live);
    await screen.findByText("Ваш топ-3");
    expect(document.body.textContent).not.toContain("Максимальный бюджет");
    expect(document.body.textContent).not.toContain("Без самолётов");
    expect(
      screen.queryByPlaceholderText("Например: хочется гулять у воды"),
    ).toBeNull();
    expect(screen.getByRole("link", { name: "Меню поездки" })).toBeTruthy();
    expect(screen.getAllByText("Подходит").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Спросить про варианты")).toBeTruthy();
  });

  it("adds and removes a reaction directly on a ranking card", async () => {
    const user = userEvent.setup();
    renderLive(DEMO_TRIP_IDS.live);
    await screen.findByText("Ваш топ-3");
    const firstCard = document.querySelector<HTMLElement>(".city-card")!;
    const reaction = within(firstCard).getByRole("button", {
      name: "Хочу · 1",
    });
    await user.click(reaction);
    await waitFor(() =>
      expect(
        within(document.querySelector<HTMLElement>(".city-card")!).getByRole(
          "button",
          {
            name: "Хочу · 2",
          },
        ),
      ).toBeTruthy(),
    );
    await user.click(
      within(document.querySelector<HTMLElement>(".city-card")!).getByRole(
        "button",
        {
          name: "Хочу · 2",
        },
      ),
    );
    await waitFor(() =>
      expect(
        within(document.querySelector<HTMLElement>(".city-card")!).getByRole(
          "button",
          {
            name: "Хочу · 1",
          },
        ),
      ).toBeTruthy(),
    );
  });

  it("provides clear navigation from home and a trip list", async () => {
    renderPage("/", <Route path="/" element={<StartPage />} />);
    expect(
      (await screen.findByRole("link", { name: /Новая поездка/ })).getAttribute(
        "href",
      ),
    ).toBe("/new");
    expect(
      screen.getByRole("link", { name: /Мои поездки/ }).getAttribute("href"),
    ).toBe("/trips");
    cleanup();

    renderPage("/trips", <Route path="/trips" element={<TripsPage />} />);
    expect(
      await screen.findByRole("heading", { name: "Поездки" }),
    ).toBeTruthy();
    expect(
      (await screen.findAllByText("Сентябрьский побег")).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole("link", { name: "Назад" }).getAttribute("href"),
    ).toBe("/");
  });

  it("copies a working invite URL", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    const id = DEMO_TRIP_IDS.live;
    renderPage(
      `/trips/${id}/invite`,
      <Route path="/trips/:tripId/invite" element={<InvitePage />} />,
    );
    await user.click(await screen.findByRole("button", { name: /Копировать/ }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining("/join/")),
    );
    expect(await screen.findByText("Ссылка скопирована")).toBeTruthy();
  });

  it("redirects a finalized trip to the final screen", async () => {
    renderLive(DEMO_TRIP_IDS.final);
    expect(await screen.findByText("Решено")).toBeTruthy();
    expect(screen.getAllByText("Казань").length).toBeGreaterThan(0);
    expect(screen.getByText("Твой маршрут")).toBeTruthy();
    expect(screen.getByText("Где остановиться")).toBeTruthy();
    expect(
      screen.queryByRole("navigation", { name: "Навигация по поездке" }),
    ).toBeNull();
  });

  it("persists reactions and shortlist choices", async () => {
    const user = userEvent.setup();
    const id = DEMO_TRIP_IDS.live;
    renderPage(
      `/trips/${id}/shortlist`,
      <Route path="/trips/:tripId/shortlist" element={<ShortlistPage />} />,
    );
    await screen.findByText("Что оставим?");
    await user.click(document.querySelector(".shortlist-item")!);
    await user.click(screen.getByRole("button", { name: "Нравится · 1" }));
    expect(
      await screen.findByRole("button", { name: "Нравится · 2" }),
    ).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Сохранить общий выбор" }),
    );
    expect(
      await screen.findByRole("button", { name: "Проверить итоговый выбор" }),
    ).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Проверить итоговый выбор" }),
    );
    expect(
      screen.getByRole("button", { name: "Зафиксировать Казань" }),
    ).toBeTruthy();
    expect(screen.getByText(/перейдёт к итогам для всей группы/)).toBeTruthy();
  });

  it("labels comparison costs as a per-person range", async () => {
    const id = DEMO_TRIP_IDS.live;
    renderPage(
      `/trips/${id}/compare`,
      <Route path="/trips/:tripId/compare" element={<ComparePage />} />,
    );
    expect(await screen.findByText("Дорога на человека")).toBeTruthy();
    expect(screen.getAllByText(/₽.*–.*₽/).length).toBeGreaterThan(0);
  });

  it("shows a useful comparison state before two cities are calculated", async () => {
    const id = DEMO_TRIP_IDS.empty;
    renderPage(
      `/trips/${id}/compare`,
      <Route path="/trips/:tripId/compare" element={<ComparePage />} />,
    );
    expect(await screen.findByText("Сравнивать пока нечего")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "К обзору поездки" })
        .getAttribute("href"),
    ).toBe(`/trips/${id}/live`);
    expect(screen.queryByText("Почему так")).toBeNull();
  });

  it("shows a facts-first explanation on a destination", async () => {
    const id = DEMO_TRIP_IDS.live;
    const cityId = "42100000-0000-4000-8000-000000000001";
    renderPage(
      `/trips/${id}/cities/${cityId}`,
      <Route
        path="/trips/:tripId/cities/:cityId"
        element={<DestinationPage />}
      />,
    );
    expect(await screen.findByText("Почему так")).toBeTruthy();
    expect(await screen.findByText(/даёт группе хороший баланс/)).toBeTruthy();
    expect(screen.getByText(/без AI/)).toBeTruthy();
    expect(screen.getAllByRole("progressbar").length).toBe(5);
  });
});

function renderLive(id: string) {
  return render(
    <AppProviders api={new FixtureRendezvousApi()}>
      <MemoryRouter initialEntries={[`/trips/${id}/live`]}>
        <Routes>
          <Route path="/trips/:tripId/live" element={<LiveRoomPage />} />
          <Route path="/trips/:tripId/final" element={<FinalTripPage />} />
        </Routes>
      </MemoryRouter>
    </AppProviders>,
  );
}

function renderPage(path: string, route: ReactElement) {
  return render(
    <AppProviders api={new FixtureRendezvousApi()}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>{route}</Routes>
      </MemoryRouter>
    </AppProviders>,
  );
}
