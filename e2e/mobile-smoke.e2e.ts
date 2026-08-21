import { expect, test, type Browser, type Page } from "@playwright/test";
import pg from "pg";

const { Client } = pg;

test("mobile organizer and guest can complete a trip", async ({
  browser,
}, testInfo) => {
  const browserFailures: string[] = [];
  let tripId: string | undefined;
  const testUserIds: string[] = [];
  const organizerContext = await mobileContext(browser);
  const guestContext = await mobileContext(browser);
  const organizer = await organizerContext.newPage();
  const guest = await guestContext.newPage();
  monitor(organizer, browserFailures);
  monitor(guest, browserFailures);

  try {
    await organizer.goto("/");
    testUserIds.push(await browserIdentity(organizer));
    await expect(
      organizer.getByRole("heading", { name: /Встретимся/ }),
    ).toBeVisible();
    await expect(
      organizer.getByRole("link", { name: /Новая поездка/ }),
    ).toBeVisible();
    await expect(
      organizer.getByRole("link", { name: /Мои поездки/ }),
    ).toBeVisible();
    await assertMobileLayout(organizer);

    await organizer.getByRole("link", { name: /Новая поездка/ }).click();
    const title = `E2E mobile ${Date.now()}`;
    await organizer.getByLabel("Название поездки").fill(title);
    await organizer.getByLabel("Сколько вас").selectOption("2");
    await organizer.getByRole("button", { name: "Создать поездку" }).click();
    await organizer.waitForURL(/\/trips\/[^/]+\/me$/);
    tripId = /\/trips\/([^/]+)/.exec(organizer.url())?.[1];
    expect(tripId).toBeTruthy();
    await fillPreferences(organizer, "Москва", "Хочется без ночных поездок");
    await organizer
      .getByRole("button", { name: "Готово, считать варианты" })
      .click();
    await organizer.waitForURL(new RegExp(`/trips/${tripId}/live$`));
    await assertMobileLayout(organizer);

    await organizer.getByRole("link", { name: "Меню поездки" }).click();
    await expect(
      organizer.getByRole("navigation", { name: "Разделы поездки" }),
    ).toBeVisible();
    await organizer.getByRole("link", { name: /Позвать друзей/ }).click();
    await expect(
      organizer.getByRole("heading", { name: "Позвать в поездку" }),
    ).toBeVisible();
    const inviteUrl = await organizer.locator(".copy-invite span").innerText();
    const invitePath = new URL(inviteUrl).pathname;
    expect(invitePath).toMatch(/^\/join\/[A-Za-z0-9_-]{22}$/);
    await assertMobileLayout(organizer);

    await guest.goto(invitePath);
    await guest.getByRole("button", { name: "Присоединиться" }).click();
    await guest.waitForURL(new RegExp(`/trips/${tripId}/me$`));
    testUserIds.push(await browserIdentity(guest));
    await fillPreferences(
      guest,
      "Санкт-Петербург",
      "Хочется гулять у воды и приехать утром",
    );
    await guest
      .getByRole("button", { name: "Готово, считать варианты" })
      .click();
    await guest.waitForURL(new RegExp(`/trips/${tripId}/live$`));

    await organizer.goto(`/trips/${tripId}/live`);
    await expect(organizer.getByText("2 из 2", { exact: false })).toBeVisible();
    await expect(
      organizer.getByRole("heading", { name: "Ваш топ-3" }),
    ).toBeVisible({
      timeout: 120_000,
    });
    await organizer.screenshot({
      path: testInfo.outputPath("live-mobile.png"),
      fullPage: true,
    });
    await assertMobileLayout(organizer);

    await organizer
      .getByRole("link", { name: /Почему этот город/ })
      .first()
      .click();
    await expect(
      organizer.getByRole("heading", { name: "Как добираемся" }),
    ).toBeVisible();
    await expect(organizer.locator(".explanation-panel small")).toContainText(
      "Основано на расчёте",
      { timeout: 45_000 },
    );
    await assertMobileLayout(organizer);

    await organizer.getByRole("link", { name: "Сравнить" }).click();
    await expect(
      organizer.getByRole("heading", { name: "Чем отличаются" }),
    ).toBeVisible();
    await assertMobileLayout(organizer);

    await organizer.getByRole("link", { name: "Выбор" }).click();
    await expect(
      organizer.getByRole("heading", { name: "Что оставим?" }),
    ).toBeVisible();
    await organizer.locator(".shortlist-item").first().click();
    const reactions = organizer.getByLabel(/^Реакции:/);
    await reactions.getByRole("button", { name: /♥/ }).click();
    await expect(reactions.getByRole("button", { name: /♥ 1/ })).toBeVisible();
    await organizer
      .getByRole("button", { name: "Сохранить shortlist" })
      .click();
    const finalize = organizer.getByRole("button", {
      name: "Зафиксировать город",
    });
    await expect(finalize).toBeVisible();
    await finalize.click();
    await organizer.waitForURL(new RegExp(`/trips/${tripId}/final$`));
    await expect(organizer.getByText("Твой маршрут")).toBeVisible();
    await expect(
      organizer.getByRole("link", { name: "Билет туда на Туту" }),
    ).toBeVisible();
    await expect(
      organizer.getByRole("link", { name: "Билет обратно на Туту" }),
    ).toBeVisible();
    await expect(organizer.getByText("Где остановиться")).toBeVisible();
    await organizer.screenshot({
      path: testInfo.outputPath("final-mobile.png"),
      fullPage: true,
    });
    await assertMobileLayout(organizer);

    await expect.poll(() => browserFailures, { timeout: 2_000 }).toEqual([]);
  } finally {
    await organizerContext.close().catch(() => undefined);
    await guestContext.close().catch(() => undefined);
    if (tripId) await deleteTestState(tripId, testUserIds);
  }
});

async function fillPreferences(page: Page, origin: string, natural: string) {
  await page.getByLabel("Город отправления").selectOption({ label: origin });
  await page.getByLabel("Максимальный бюджет").fill("100000");
  await page.getByLabel(/Пожелание своими словами/).fill(natural);
}

function mobileContext(browser: Browser) {
  return browser.newContext({
    baseURL: "http://127.0.0.1:5173",
    locale: "ru-RU",
    viewport: { width: 412, height: 839 },
    deviceScaleFactor: 2.625,
    hasTouch: true,
    isMobile: true,
  });
}

async function assertMobileLayout(page: Page) {
  const size = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(
    size.content,
    `horizontal overflow: ${JSON.stringify(size)}`,
  ).toBeLessThanOrEqual(size.viewport);
}

async function browserIdentity(page: Page) {
  const id = await page.evaluate(() =>
    localStorage.getItem("rendezvous-test-user-id"),
  );
  if (!id) throw new Error("Development browser identity was not created");
  return id;
}

function monitor(page: Page, failures: string[]) {
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  page.on("response", (response) => {
    if (
      response.status() >= 400 &&
      new URL(response.url()).host === "127.0.0.1:5173"
    ) {
      failures.push(
        `${response.status()} ${response.request().method()} ${response.url()}`,
      );
    }
  });
}

async function deleteTestState(tripId: string, userIds: readonly string[]) {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return;
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query("DELETE FROM rendezvous.trips WHERE id = $1", [tripId]);
    await client.query(
      "DELETE FROM rendezvous.users WHERE id = ANY($1::uuid[])",
      [userIds],
    );
  } finally {
    await client.end();
  }
}
