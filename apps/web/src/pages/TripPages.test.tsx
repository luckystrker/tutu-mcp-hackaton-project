// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { AppProviders } from "../app/providers.js";
import { DEMO_TRIP_IDS, FixtureRendezvousApi } from "../demo/fixtures.js";
import { FinalTripPage, LiveRoomPage } from "./TripPages.js";

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
    await user.click(screen.getByRole("button", { name: "Дешевле" }));
    expect(screen.queryByText("Собираем поездку…")).toBeNull();
    await waitFor(() => {
      const cards = document.querySelectorAll(".city-card h3");
      expect(cards[0]?.textContent).toBe("Нижний Новгород");
    });
  });

  it("does not render another participant's private constraints", async () => {
    renderLive(DEMO_TRIP_IDS.live);
    await screen.findByText("Ваш топ-3");
    expect(document.body.textContent).not.toContain("Максимальный бюджет");
    expect(document.body.textContent).not.toContain("Без самолётов");
  });

  it("redirects a finalized trip to the final screen", async () => {
    renderLive(DEMO_TRIP_IDS.final);
    expect(await screen.findByText("Решено")).toBeTruthy();
    expect(screen.getAllByText("Казань").length).toBeGreaterThan(0);
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
