import { expect, test } from "@playwright/test";
import { accessToken, adminClient, cleanupOrganizer, createAccount, createEvent } from "./constitutional-fixtures";
import { coverFixtureDirectory, generateCoverFixtures, newCoverOperationId } from "./event-cover-fixtures";
import path from "node:path";

test.beforeAll(generateCoverFixtures);

test("editor preserves drafts on rejection/conflict and fits mobile, intermediate widths and 200% zoom", async ({ page, request }) => {
  const admin = adminClient(), owner = await createAccount(admin, "cover-responsive"), event = await createEvent(admin, owner.id, 10);
  try {
    await page.goto("/organizador"); await page.getByLabel("Email", { exact: true }).fill(owner.email); await page.getByLabel("Contraseña").fill(owner.password);
    await page.getByRole("button", { name: "Ingresar" }).click();
    await page.locator("article").filter({ hasText: event.title }).getByRole("button", { name: "Editar", exact: true }).first().click();
    const editor = page.getByRole("region", { name: "Portada del evento" }), selector = editor.getByLabel("Archivo de portada");
    await selector.setInputFiles(path.join(coverFixtureDirectory, "portrait.png"));
    await selector.setInputFiles([]); // Canceling the chooser does not discard the staged preview.
    await expect(editor.getByText("Vista previa; cambios sin guardar")).toBeVisible();
    await editor.getByRole("button", { name: "Descartar cambios" }).click();
    await expect(editor.getByText("Sin portada")).toBeVisible();
    await selector.setInputFiles(path.join(coverFixtureDirectory, "narrow.png"));
    await editor.getByRole("button", { name: "Guardar portada", exact: true }).click();
    await expect(editor.getByRole("alert")).toBeFocused();
    await expect(editor.getByText("Vista previa; cambios sin guardar")).toBeVisible();
    await selector.setInputFiles(path.join(coverFixtureDirectory, "portrait.png"));
    await editor.getByRole("button", { name: "Guardar portada", exact: true }).click();
    await expect(editor.getByRole("status")).toContainText("Portada guardada.");
    const token = await accessToken(owner.email, owner.password), headers = { Authorization: `Bearer ${token}` }, base = `/api/eventos/${event.id}/portada`;
    await editor.getByLabel("Texto alternativo", { exact: true }).fill("Draft survives conflict");
    const external = await request.patch(base, { headers, data: { operationId: newCoverOperationId(), expectedRevision: "1", positionY: 0.8 } }); expect(external.status()).toBe(200);
    await editor.getByRole("button", { name: "Guardar portada", exact: true }).click();
    await expect(editor.getByRole("alert")).toBeVisible(); await expect(editor.getByLabel("Texto alternativo", { exact: true })).toHaveValue("Draft survives conflict");
    await editor.getByRole("button", { name: "Cargar portada actual" }).click();
    await expect(editor.getByLabel("Texto alternativo", { exact: true })).toHaveValue("Draft survives conflict");
    await editor.getByRole("button", { name: "Guardar portada", exact: true }).click(); await expect(editor.getByRole("status")).toContainText("Portada guardada.");
    for (const [width, zoom] of [[375, 1], [700, 1], [1440, 1], [1440, 2]]) {
      await page.setViewportSize({ width, height: 1000 }); await page.evaluate((scale) => { document.documentElement.style.zoom = String(scale); }, zoom);
      await editor.scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      const editorBounds = (await editor.boundingBox())!;
      for (const input of await editor.locator("input,textarea,button").all()) {
        const bounds = (await input.boundingBox())!;
        expect(bounds.height).toBeGreaterThanOrEqual(44 * zoom - 0.02);
        expect(bounds.x).toBeGreaterThanOrEqual(editorBounds.x);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(editorBounds.x + editorBounds.width);
      }
      const generalForm = page.locator(".event-configuration-editor > form"), formBounds = (await generalForm.boundingBox())!;
      for (const input of await generalForm.locator("input,select,textarea").all()) {
        const bounds = (await input.boundingBox())!;
        expect(bounds.x).toBeGreaterThanOrEqual(formBounds.x);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(formBounds.x + formBounds.width);
      }
      const horizontal = editor.getByLabel("Posición horizontal"); await horizontal.focus(); await horizontal.press("Home");
      await expect(horizontal).toHaveAttribute("aria-valuetext", "0%");
      await expect(editor.getByRole("button", { name: "Guardar portada", exact: true })).toBeEnabled();
      await expect(editor.locator("img")).toHaveClass(/event-cover-loaded/);
      expect(await horizontal.evaluate((element) => getComputedStyle(element).boxShadow)).toContain("0px 0px 0px 3px");
      if (!process.env.E2E_COVER_SKIP_CAPTURES) await page.screenshot({ path: path.join("test-results", `event-cover-editor-${width}-zoom-${zoom}.png`), fullPage: true });
    }
    await page.evaluate(() => { document.documentElement.style.zoom = "1"; });
    const longTitle = "Encuentro cultural con un título extenso " + "identidad".repeat(12);
    await admin.from("events").update({ title: longTitle }).eq("id", event.id);
    expect((await request.patch(base, { headers, data: { operationId: newCoverOperationId(), expectedRevision: "3", altText: null } })).status()).toBe(200);
    for (const width of [375, 700, 1440]) for (const surface of ["list", "registration"]) {
      await page.setViewportSize({ width, height: 1000 }); await page.goto(surface === "list" ? "/" : `/eventos/${event.publicCode}/registro`);
      const region = surface === "list" ? page.locator("article").filter({ hasText: longTitle }) : page.locator(".public-event-header");
      await expect(region.getByAltText(`Portada de ${longTitle}`)).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      if (!process.env.E2E_COVER_SKIP_CAPTURES) await page.screenshot({ path: path.join("test-results", `event-cover-${surface}-${width}-long-title.png`), fullPage: true });
    }
  } finally { await cleanupOrganizer(admin, owner.id); }
});

test("save optional cover independently, reopen editor and both public views", async ({ page, request }) => {
  const admin = adminClient(); const owner = await createAccount(admin, "cover-editor");
  const event = await createEvent(admin, owner.id, 10);
  try {
    await page.goto("/organizador");
    await page.getByLabel("Email", { exact: true }).fill(owner.email);
    await page.getByLabel("Contraseña").fill(owner.password);
    await page.getByRole("button", { name: "Ingresar" }).click();
    await page.locator("article").filter({ hasText: event.title }).getByRole("button", { name: "Editar", exact: true }).first().click();
    const eventForm = page.locator("form").first();
    await eventForm.getByLabel("Nombre", { exact: true }).fill("Draft general preserved");
    const editor = page.getByRole("region", { name: "Portada del evento" });
    await editor.getByLabel("Archivo de portada").setInputFiles(path.join(coverFixtureDirectory, "portrait.png"));
    await expect(editor.getByText("Vista previa; cambios sin guardar")).toBeVisible();
    await editor.getByLabel("Texto alternativo", { exact: true }).fill("Portada personalizada");
    await editor.getByLabel("Posición horizontal").fill("25");
    await editor.getByLabel("Posición vertical").fill("70");
    await editor.getByRole("button", { name: "Guardar portada", exact: true }).click();
    await expect(editor.getByRole("status")).toContainText("Portada guardada.");
    await expect(eventForm.getByLabel("Nombre", { exact: true })).toHaveValue("Draft general preserved");
    const token = await accessToken(owner.email, owner.password);
    const state = await request.get(`/api/eventos/${event.id}/portada`, { headers: { Authorization: `Bearer ${token}` } });
    expect(state.ok()).toBeTruthy();
    const saved = await state.json(); expect(saved.cover).toMatchObject({ altText: "Portada personalizada", positionX: 0.25, positionY: 0.7 });
    await page.goto("/");
    const card = page.locator("article").filter({ hasText: event.title });
    await expect(card.getByAltText("Portada personalizada")).toBeVisible();
    await card.getByRole("link", { name: `Reservar entrada para ${event.title}` }).click();
    await expect(page.getByAltText("Portada personalizada")).toBeVisible();
    await expect(page.getByRole("button", { name: "Enviar enlace de confirmación" })).toBeVisible();
    await page.goto("/organizador");
    await page.locator("article").filter({ hasText: event.title }).getByRole("button", { name: "Editar", exact: true }).first().click();
    await expect(page.getByLabel("Texto alternativo", { exact: true })).toHaveValue("Portada personalizada");
    await expect(page.getByLabel("Posición horizontal")).toHaveValue("25");
    await expect(page.getByLabel("Posición vertical")).toHaveValue("70");
  } finally { await cleanupOrganizer(admin, owner.id); }
});

test("maintain cover with keyboard, replace centered, recover a lost response and remove", async ({ page }) => {
  const admin = adminClient(); const owner = await createAccount(admin, "cover-maintenance"); const event = await createEvent(admin, owner.id, 10);
  try {
    await page.goto("/organizador"); await page.getByLabel("Email", { exact: true }).fill(owner.email); await page.getByLabel("Contraseña").fill(owner.password);
    await page.getByRole("button", { name: "Ingresar" }).click();
    await page.locator("article").filter({ hasText: event.title }).getByRole("button", { name: "Editar", exact: true }).first().click();
    const editor = page.getByRole("region", { name: "Portada del evento" });
    await editor.getByLabel("Archivo de portada").setInputFiles(path.join(coverFixtureDirectory, "minimum.jpeg"));
    await editor.getByRole("button", { name: "Guardar portada", exact: true }).click();
    await expect(editor.getByRole("status")).toContainText("Portada guardada.");
    await editor.getByLabel("Texto alternativo", { exact: true }).fill("Custom alternative");
    await expect(editor.getByRole("button", { name: "Guardar portada", exact: true })).toBeEnabled();
    const horizontal = editor.getByLabel("Posición horizontal"); await horizontal.focus(); await horizontal.press("Home");
    const vertical = editor.getByLabel("Posición vertical"); await vertical.focus(); await vertical.press("End");
    await editor.getByRole("button", { name: "Guardar portada", exact: true }).click();
    await expect(editor.getByRole("status")).toContainText("Portada guardada.");
    await expect(horizontal).toHaveValue("0"); await expect(vertical).toHaveValue("100");
    await editor.getByLabel("Archivo de portada").setInputFiles(path.join(coverFixtureDirectory, "square.png"));
    await expect(editor.getByLabel("Texto alternativo", { exact: true })).toHaveValue(""); await expect(horizontal).toHaveValue("50"); await expect(vertical).toHaveValue("50");
    let dropped = false;
    await page.route(`**/api/eventos/${event.id}/portada/confirmar`, async (route) => {
      if (dropped) return route.continue(); dropped = true;
      const response = await route.fetch(); expect(response.status()).toBe(200); await route.abort();
    });
    await editor.getByRole("button", { name: "Guardar portada", exact: true }).click();
    await expect(editor.getByRole("status")).toContainText("Portada guardada.");
    const { data } = await admin.from("event_covers").select("revision").eq("event_id", event.id).single(); expect(data?.revision).toBe(3);
    await editor.getByRole("button", { name: "Quitar portada", exact: true }).click();
    await expect(editor.getByRole("status")).toContainText("Portada retirada.");
    await expect(editor.getByLabel("Archivo de portada")).toBeFocused();
    await page.goto("/"); await expect(page.locator("article").filter({ hasText: event.title }).getByText("Sin portada")).toBeVisible();
    await page.goto(`/eventos/${event.publicCode}/registro`); await expect(page.getByText("Sin portada")).toBeVisible();
  } finally { await cleanupOrganizer(admin, owner.id); }
});
