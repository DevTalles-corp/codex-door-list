import path from "node:path";
import { expect, test } from "@playwright/test";
import { accessToken, adminClient, cleanupOrganizer, createAccount, createEvent } from "./constitutional-fixtures";
import { coverFixture, generateCoverFixtures } from "./event-cover-fixtures";
import { createClient } from "@supabase/supabase-js";

test.beforeAll(generateCoverFixtures);

for (const width of [375, 1440]) test(`public covers keep geometry and text at ${width}px, including optimizer failure`, async ({ page, request }) => {
  await page.setViewportSize({ width, height: 1000 });
  const admin = adminClient(); const owner = await createAccount(admin, "cover-layout"); const event = await createEvent(admin, owner.id, 10);
  const token = await accessToken(owner.email, owner.password); const headers = { Authorization: `Bearer ${token}` };
  const base = `/api/eventos/${event.id}/portada`; let revision = "0";
  const client = createClient(process.env.E2E_SUPABASE_URL!, process.env.E2E_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  try {
    const geometries: Record<string, { coverHeight: number; cardHeight: number; titleY: number; actionY: number }>[] = [];
    for (const name of [null, "minimum.png", "portrait.png", "square.png", "transparent.png", "light.png", "dark.png", "dense.png", "exif-6.jpeg"] as const) {
      if (name) {
        const bytes = await coverFixture(name);
        const preparation = await request.post(`${base}/subidas`, { headers, data: { expectedRevision: revision, byteSize: bytes.length } });
        expect(preparation.ok()).toBeTruthy(); const prepared = await preparation.json();
        expect((await client.storage.from(prepared.upload.bucket).uploadToSignedUrl(prepared.upload.path, prepared.upload.token, bytes, { contentType: "application/octet-stream" })).error).toBeNull();
        const result = await request.post(`${base}/confirmar`, { headers, data: { operationId: prepared.operationId, expectedRevision: revision } });
        expect(result.ok()).toBeTruthy(); revision = (await result.json()).revision;
      }
      const capture: Record<string, { coverHeight: number; cardHeight: number; titleY: number; actionY: number }> = {};
      for (const surface of ["list", "registration"]) {
        await page.goto(surface === "list" ? "/" : `/eventos/${event.publicCode}/registro`);
        const region = surface === "list" ? page.locator("article").filter({ hasText: event.title }) : page.locator(".public-event-header");
        await expect(region).toBeVisible();
        if (surface === "list") {
          expect(await region.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgb(255, 255, 255)");
          const columns = await region.locator("..").locator("..").evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length);
          if (width <= 700) expect(columns).toBe(1); else expect(columns).toBeGreaterThanOrEqual(2);
          const columnWidth = await region.locator("..").evaluate((element) => element.getBoundingClientRect().width);
          expect((await region.boundingBox())!.width).toBeCloseTo(columnWidth, 2);
        }
        const cover = region.locator(".event-cover"); await expect(cover).toBeVisible();
        const box = (await cover.boundingBox())!; expect(Math.abs(box.width / box.height - 16 / 9)).toBeLessThan(0.002);
        const title = (await region.locator(surface === "list" ? "h3" : "h1").boundingBox())!;
        const action = surface === "list" ? region.getByRole("link", { name: `Reservar entrada para ${event.title}` }) : page.getByRole("button", { name: "Enviar enlace de confirmación" });
        await expect(action).toBeVisible();
        const actionBox = (await action.boundingBox())!;
        capture[surface] = { coverHeight: box.height, cardHeight: (await region.boundingBox())!.height, titleY: title.y, actionY: actionBox.y };
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
        if (surface === "list") {
          expect(box.x).toBeGreaterThanOrEqual(16);
          expect((await page.locator(".landing-shell").boundingBox())!.width).toBeLessThanOrEqual(1120);
          expect(await region.locator("h3").innerText()).toBe(event.title);
          expect((await region.locator(".agenda-event-actions").boundingBox())!.y).toBeGreaterThan(title.y);
        }
        if (name) {
          const image = region.locator("img"); await expect(image).toHaveAttribute("alt", `Portada de ${event.title}`);
          await expect(image).toHaveClass(/event-cover-loaded/);
        } else await expect(cover.getByText("Sin portada")).toBeVisible();
        await page.screenshot({ path: path.join("test-results", `event-cover-${surface}-${width}-${name ?? "absent"}.png`), fullPage: true });
      }
      geometries.push(capture);
    }
    for (const geometry of geometries) for (const surface of ["list", "registration"]) {
      for (const key of ["coverHeight", "cardHeight", "titleY", "actionY"] as const)
        expect(Math.abs(geometry[surface][key] - geometries[0][surface][key])).toBeLessThanOrEqual(0.02);
    }
    for (const surface of ["list", "registration"]) {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      const delayed = async (route: import("@playwright/test").Route) => { await gate; await route.continue(); };
      await page.route("**/_next/image?*", delayed);
      await page.goto(surface === "list" ? "/" : `/eventos/${event.publicCode}/registro`, { waitUntil: "domcontentloaded" });
      const region = surface === "list" ? page.locator("article").filter({ hasText: event.title }) : page.locator(".public-event-header");
      await region.scrollIntoViewIfNeeded();
      await expect(region.getByText("Cargando portada", { exact: true })).toBeVisible();
      const measure = async () => {
        const action = surface === "list" ? region.getByRole("link", { name: `Reservar entrada para ${event.title}` }) : page.getByRole("button", { name: "Enviar enlace de confirmación" });
        const actionBox = (await action.boundingBox())!;
        const shape = await region.evaluate((element) => {
        const box = element.getBoundingClientRect(), cover = element.querySelector(".event-cover")!.getBoundingClientRect(), title = element.querySelector("h1,h3")!.getBoundingClientRect();
        const date = element.querySelector("time,.event-meta")?.getBoundingClientRect();
        return { height: box.height, cover: cover.height, title: title.top - box.top, date: date ? date.top - box.top : null };
        });
        return { ...shape, actionY: actionBox.y };
      };
      const before = await measure();
      await page.screenshot({ path: path.join("test-results", `event-cover-${surface}-${width}-loading.png`), fullPage: true });
      release(); await expect(region.locator("img")).toHaveClass(/event-cover-loaded/);
      expect(await measure()).toEqual(before);
      await page.unroute("**/_next/image?*", delayed);
    }
    // Optimizer-only failure recovers the same original once.
    await page.route("**/_next/image?*", (route) => route.abort());
    await page.goto(`/eventos/${event.publicCode}/registro`);
    await expect(page.locator(".public-event-header img")).toHaveClass(/event-cover-loaded/);
    await expect(page.locator(".public-event-header img")).toHaveAttribute("src", /\/storage\/v1\/object\/public\/event-covers\//);
    await page.unroute("**/_next/image?*");
    let optimizedFailures = 0; let originals = 0;
    await page.route("**/_next/image?*", (route) => { optimizedFailures++; return route.abort(); });
    await page.route("**/storage/v1/object/public/event-covers/**", (route) => { originals++; return route.abort(); });
    await page.goto("/");
    const failedCard = page.locator("article").filter({ hasText: event.title }); await failedCard.scrollIntoViewIfNeeded();
    await expect(failedCard.getByText("Portada no disponible")).toBeVisible();
    expect((await failedCard.boundingBox())!.height).toBeCloseTo(geometries[0].list.cardHeight, 2);
    await expect(failedCard.locator("img")).toHaveCount(0);
    await page.screenshot({ path: path.join("test-results", `event-cover-list-${width}-failed.png`), fullPage: true });
    optimizedFailures = 0; originals = 0;
    await page.goto(`/eventos/${event.publicCode}/registro`);
    await expect(page.getByText("Portada no disponible")).toBeVisible();
    expect(optimizedFailures).toBe(1); expect(originals).toBe(1);
    await expect(page.locator(".public-event-header img")).toHaveCount(0);
    await page.screenshot({ path: path.join("test-results", `event-cover-registration-${width}-failed.png`), fullPage: true });
    await page.getByRole("radio", { name: /General/ }).check();
    await page.getByLabel("Nombre completo").fill("Reserva independiente");
    await page.getByLabel("Email", { exact: true }).fill(`layout-${width}@example.test`);
    await page.getByRole("button", { name: "Enviar enlace de confirmación" }).click();
    await expect(page.getByRole("heading", { name: "Revisa tu email" })).toBeVisible();
    await page.screenshot({ path: path.join("test-results", `event-cover-${width}.png`), fullPage: true });
  } finally { await cleanupOrganizer(admin, owner.id); }
});
