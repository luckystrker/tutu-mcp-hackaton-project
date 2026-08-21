import { expect, test, type Page } from "@playwright/test";

const trips = {
  running: "40000000-0000-4000-8000-000000000002",
  live: "40000000-0000-4000-8000-000000000001",
  degraded: "40000000-0000-4000-8000-000000000003",
  final: "40000000-0000-4000-8000-000000000006",
} as const;

test("marked fixture fallback covers the release demo states", async ({
  page,
}) => {
  await page.goto(`/trips/${trips.running}/live`);
  await expect(page.getByText("Демо-данные", { exact: true })).toBeVisible();
  await expect(page.getByText(/не live-результаты Туту/)).toBeVisible();
  await expect(page.getByText(/2 из 4 готовы/)).toBeVisible();
  await expect(page.getByText(/3 из 4 готовы/)).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByText(/После ответа участника Катя/)).toBeVisible();
  await assertNoHorizontalOverflow(page);

  await page.goto(`/trips/${trips.live}/live`);
  const firstCityBefore = await page
    .locator(".city-card h3")
    .first()
    .innerText();
  await page.getByText("Что для вас важнее?", { exact: true }).click();
  await page.getByRole("button", { name: "Подешевле" }).click();
  await expect(page.locator(".compute-banner--running")).toHaveCount(0);
  await expect
    .poll(() => page.locator(".city-card h3").first().innerText())
    .not.toBe(firstCityBefore);

  await page.goto(`/trips/${trips.degraded}/live`);
  await expect(page.getByText(/Некоторые варианты транспорта/)).toBeVisible();
  await expect(page.getByText("Неполные данные").first()).toBeVisible();

  await page.goto(`/trips/${trips.final}/final`);
  await expect(page.getByText("Твой маршрут")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Билет туда на Туту" }),
  ).toBeVisible();
  await assertNoHorizontalOverflow(page);
});

async function assertNoHorizontalOverflow(page: Page) {
  const widths = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(widths.content).toBeLessThanOrEqual(widths.viewport);
}
