import { expect, test, type Page } from "@playwright/test";
import type { EventListing, RegistrationData } from "../../lib/types";
import { coverFixture } from "./event-cover-fixtures";

type CoverState = "absent" | "ready" | "failed";

function publicEvent(index: number, coverState: CoverState): EventListing {
  return {
    id: `layout-event-${index}`,
    public_code: `layout-event-${index}`,
    title: `Encuentro de comunidades creativas de La Paz ${index}`,
    venue: "Centro cultural · La Paz",
    description: "Conversaciones, proyectos y nuevas ideas para compartir en comunidad.",
    event_date: new Date(Date.now() + 86_400_000).toISOString(),
    registration_closes_at: new Date(Date.now() + 86_400_000).toISOString(),
    time_zone: "America/La_Paz",
    status: "published",
    max_capacity: 50,
    remaining_capacity: 50,
    cover: coverState === "absent" ? null : {
      objectPath: `covers/${"a".repeat(64)}`,
      width: 1280,
      height: 720,
      altText: null,
      positionX: 0.5,
      positionY: 0.5,
    },
  };
}

async function mockCover(page: Page, state: () => CoverState) {
  const image = await coverFixture("dense.png");
  await page.route("**/_next/image?*", (route) => state() === "failed"
    ? route.abort()
    : route.fulfill({ contentType: "image/png", body: image }));
  await page.route("**/storage/v1/object/public/event-covers/**", (route) => route.abort());
}

async function expectCover(page: Page, state: CoverState) {
  const cover = page.locator(".event-cover").first();
  if (state === "ready") await expect(cover.locator("img")).toHaveClass(/event-cover-loaded/);
  else await expect(cover.getByText(state === "absent" ? "Sin portada" : "Portada no disponible", { exact: true })).toBeVisible();
  const box = (await cover.boundingBox())!;
  expect(box.width / box.height).toBeCloseTo(16 / 9, 2);
  expect(box.width).toBeLessThanOrEqual(480);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  return box;
}

for (const width of [375, 700, 1440]) {
  test(`sparse public groups retain compact cards across cover states at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    let count = 1;
    let state: CoverState = "absent";
    await mockCover(page, () => state);
    await page.route("**/rest/v1/rpc/get_public_event_list", (route) => route.fulfill({
      json: Array.from({ length: count }, (_, index) => publicEvent(index + 1, state)),
    }));
    let initialWidth: number | undefined;
    let initialHeight: number | undefined;
    for (state of ["absent", "ready", "failed"] as const) {
      for (count of [1, 2, 3]) {
        await page.goto("/");
        await expect(page.locator(".agenda-event")).toHaveCount(count);
        const box = await expectCover(page, state);
        const card = (await page.locator(".agenda-event").first().boundingBox())!;
        initialWidth ??= box.width;
        initialHeight ??= card.height;
        expect(box.width).toBeCloseTo(initialWidth, 1);
        expect(card.height).toBeCloseTo(initialHeight, 1);
        if (width === 1440) expect(card.width).toBeLessThan(360);
        if (count === 1 && state !== "failed") {
          await page.screenshot({ path: testInfo.outputPath(`cartelera-${state}.png`), fullPage: true });
        }
      }
    }
  });
}

for (const width of [320, 375, 700, 1440]) {
  test(`registration keeps identity first and keyboard access to the form at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    let state: CoverState = "absent";
    const description = "Compartiremos proyectos, experiencias y herramientas con las comunidades de la ciudad. ".repeat(5);
    let releaseLoading!: () => void;
    const loadingGate = new Promise<void>((resolve) => { releaseLoading = resolve; });
    await mockCover(page, () => state);
    await page.route("**/rest/v1/rpc/get_public_event_registration", async (route) => {
      await loadingGate;
      await route.fulfill({
        json: {
          event: { ...publicEvent(1, state), description },
          ticket_types: [{ id: "general", name: "General", max_capacity: 50, remaining_capacity: 50 }],
        } satisfies RegistrationData,
      });
    });
    let initialCoverHeight: number | undefined;
    for (state of ["absent", "ready", "failed"] as const) {
      await page.goto("/eventos/layout-event-1/registro");
      let loadingCover;
      if (state === "absent") {
        await expect(page.getByRole("main")).toHaveAttribute("aria-busy", "true");
        loadingCover = await page.locator(".event-cover").boundingBox();
        releaseLoading();
      }
      await expect(page.getByRole("heading", { name: "Reserva tu entrada" })).toBeVisible();
      const cover = await expectCover(page, state);
      if (loadingCover) {
        expect(cover.width).toBeCloseTo(loadingCover.width, 1);
        expect(cover.height).toBeCloseTo(loadingCover.height, 1);
      }
      initialCoverHeight ??= cover.height;
      expect(cover.height).toBeCloseTo(initialCoverHeight, 1);
      const metadata = (await page.locator(".event-meta").boundingBox())!;
      expect(metadata.y + metadata.height).toBeLessThan(cover.y);
      await expect(page.getByText(description, { exact: true })).toBeHidden();
      const details = page.getByText("Detalles del evento", { exact: true });
      await details.focus();
      await page.keyboard.press("Enter");
      await expect(page.getByText(description, { exact: true })).toBeVisible();
      await page.keyboard.press("Enter");
      await expect(page.getByText(description, { exact: true })).toBeHidden();

      const shortcut = page.getByRole("link", { name: "Reservar entrada", exact: true });
      if (width <= 700) {
        const formCard = (await page.getByRole("region", { name: "Reserva tu entrada" }).boundingBox())!;
        expect(formCard.x).toBeCloseTo(cover.x, 1);
        expect(formCard.width).toBeCloseTo(cover.width, 1);
        await shortcut.focus();
        await page.keyboard.press("Enter");
        await expect(page.getByRole("heading", { name: "Reserva tu entrada" })).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(page.getByRole("radio", { name: /General/ })).toBeFocused();
        await expect(page.getByRole("radio", { name: /General/ })).toBeInViewport();
      } else await expect(shortcut).toBeHidden();
      await page.getByLabel("Nombre completo").fill("María de la Paz");
      await page.getByLabel("Email", { exact: true }).fill("layout@example.test");
      await expect(page.getByLabel("Nombre completo")).toHaveValue("María de la Paz");
      await page.evaluate(() => window.scrollTo(0, 0));
      if (state !== "failed") await page.screenshot({ path: testInfo.outputPath(`registro-${state}.png`), fullPage: true });
    }
  });
}
