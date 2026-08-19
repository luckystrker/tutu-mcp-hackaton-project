// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "../app/providers.js";
import { DEMO_TRIP_IDS, FixtureRendezvousApi } from "../demo/fixtures.js";
import {
  FinalTripPage,
  InvitePage,
  LiveRoomPage,
  ShortlistPage,
  StartPage,
  TripsPage,
} from "./TripPages.js";

afterEach(cleanup);

describe("core trip pages", () => {
  it("keeps previous ranking visible while recompute is running", async () => {
    renderLive(DEMO_TRIP_IDS.running);
    expect(await screen.findByText("Пересчитываем маршрут")).toBeTruthy();
    expect(screen.getAllByText("Казань").length).toBeGreaterThan(0);
    expect(
      screen.getByText("Пока показываем предыдущий результат"),
    ).toBeTruthy();
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
    await user.click(screen.getByRole("button", { name: "♥ 1" }));
    expect(await screen.findByRole("button", { name: "♥ 2" })).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Сохранить shortlist" }),
    );
    expect(
      await screen.findByRole("button", { name: "Зафиксировать город" }),
    ).toBeTruthy();
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
