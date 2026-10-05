import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { accessToken, adminClient, capacityEvent, cleanupOrganizer, createAccount } from "./capacity-fixtures";
import { configurationError, parseEventConfiguration } from "../../lib/event-configuration";
import { decodeCapacityDetails, organizerErrorMessage } from "../../lib/errors";

async function signIn(page: Page, account: { email: string; password: string }) {
  await page.goto("/organizador");
  await page.getByLabel("Email", { exact: true }).fill(account.email);
  await page.getByLabel("Contraseña").fill(account.password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page.getByRole("heading", { name: "Nuevo evento" })).toBeVisible();
}
const typeForm = (page: Page) => page.locator("form").filter({ has: page.getByRole("heading", { name: /tipo de entrada$/ }) });
const eventForm = (page: Page) => page.locator("form").filter({ has: page.getByRole("heading", { name: /^(Nuevo|Editar) evento$/ }) });
const cardFor = (page: Page, title: string) => page.locator("article").filter({ has: page.getByRole("heading", { name: title, exact: true }) });

test.describe("US1", () => {
  test("type limit rejects below consumption, accepts equality, and preserves inputs while submitting", async ({ page, request }) => {
    const admin = adminClient(); const owner = await createAccount(admin,"us1");
    try {
      const event = await capacityEvent(admin,owner.id,4,[{ name:"VIP",capacity:3,count:2 }]);
      const target = await capacityEvent(admin,owner.id,4,[{ name:"Empty",capacity:1,count:0 }]);
      await page.emulateMedia({ reducedMotion:"reduce" });
      await signIn(page,owner);
      const card = cardFor(page,event.title);
      await card.locator("li").filter({ hasText:"VIP" }).getByRole("button",{ name:"Editar" }).click();
      const form = typeForm(page);
      await form.getByLabel("Capacidad").fill("1");
      let release!: () => void;
      const barrier = new Promise<void>((resolve) => { release=resolve; });
      await page.route("**/api/eventos/*/configuracion",async (route) => { await barrier; await route.continue(); },{ times:1 });
      await form.getByRole("button",{ name:"Guardar cambios" }).click();
      await expect(form.getByRole("button",{ name:"Guardando tipo de entrada…" })).toBeDisabled();
      await expect(form.getByLabel("Capacidad")).toHaveValue("1");
      await expect(form.getByLabel("Capacidad")).toBeDisabled();
      release();
      await expect(page.locator("main").getByRole("alert")).toContainText("VIP");
      await expect(page.locator("main").getByRole("alert")).toContainText("mínimo es 2");
      await expect(page.locator("main").getByRole("alert")).toBeFocused();
      await expect(form.getByLabel("Capacidad")).toHaveValue("1");
      await expect(form.getByRole("button",{ name:"Guardar cambios" })).toBeEnabled();
      await form.getByLabel("Capacidad").fill("2");
      await form.getByLabel("Capacidad").press("Tab");
      await expect(form.getByRole("button",{ name:"Guardar cambios" })).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("status").filter({ hasText:"Tipo de entrada guardado" })).toBeVisible();
      await expect(card.locator("li").filter({ hasText:"VIP" })).toContainText("(2)");
      expect((await request.post("/api/registrations",{ data:{ eventId:event.id,ticketTypeId:event.types[0].id,name:"Third",email:`third-${randomUUID()}@example.test` } })).status()).toBe(409);
      await card.locator("li").filter({ hasText:"VIP" }).getByRole("button",{ name:"Editar" }).click();
      await form.getByLabel("Nombre",{ exact:true }).fill("VIP renamed");
      const metadataRequest=page.waitForRequest((request) => request.url().endsWith(`/api/eventos/${event.id}/configuracion`));
      await form.getByRole("button",{ name:"Guardar cambios" }).click();
      expect((await metadataRequest).postDataJSON().ticketType).toEqual({ id:event.types[0].id,name:"VIP renamed" });
      await expect(card.locator("li").filter({ hasText:"VIP renamed" })).toBeVisible();
      await card.locator("li").filter({ hasText:"VIP renamed" }).getByRole("button",{ name:"Editar" }).click();
      await form.getByLabel("Capacidad").fill("3"); await form.getByLabel("Capacidad").fill("2");
      const explicitRequest=page.waitForRequest((request) => request.url().endsWith(`/api/eventos/${event.id}/configuracion`));
      await form.getByRole("button",{ name:"Guardar cambios" }).click();
      expect((await explicitRequest).postDataJSON().ticketType.maxCapacity).toBe(2);
      await expect(page.getByRole("heading",{ name:"Nuevo tipo de entrada" })).toBeVisible();
      // Existing create/move routes still use guarded persistence DML.
      await form.getByLabel("Evento").selectOption(event.id);
      await form.getByLabel("Nombre",{ exact:true }).fill("Movable");
      await form.getByLabel("Capacidad").fill("1");
      await form.getByRole("button",{ name:"Agregar entrada" }).click();
      const movable = card.locator("li").filter({ hasText:"Movable" });
      await expect(movable).toBeVisible(); await movable.getByRole("button",{ name:"Editar" }).click();
      await form.getByLabel("Evento").selectOption(target.id);
      await form.getByRole("button",{ name:"Guardar cambios" }).click();
      await expect(cardFor(page,target.title).locator("li").filter({ hasText:"Movable" })).toBeVisible();
    } finally { await cleanupOrganizer(admin,owner.id); }
  });

  test("valid, used and revoked tickets all contribute to minimum 3", async ({ page },info) => {
    const admin=adminClient(); const owner=await createAccount(admin,"us1-revoked");
    try {
      const event=await capacityEvent(admin,owner.id,4,[{ name:"VIP",capacity:3,count:3 }]);
      await signIn(page,owner); await cardFor(page,event.title).locator("li").getByRole("button",{ name:"Editar" }).click();
      await typeForm(page).getByLabel("Capacidad").fill("2");
      await typeForm(page).getByRole("button",{ name:"Guardar cambios" }).click();
      await expect(page.locator("main").getByRole("alert")).toContainText("mínimo es 3");
      await expect(page.locator("main").getByRole("alert")).toContainText("revocadas también cuentan");
      await page.screenshot({ path:info.outputPath("capacity-error-desktop.png"),fullPage:true });
      await page.setViewportSize({ width:390,height:844 });
      await page.screenshot({ path:info.outputPath("capacity-error-mobile.png"),fullPage:true });
    } finally { await cleanupOrganizer(admin,owner.id); }
  });
});

test.describe("US2", () => {
  test("global minimum is 3 and assigned capacity is a distinct cause", async ({ page },info) => {
    const admin=adminClient(); const owner=await createAccount(admin,"us2");
    try {
      const event=await capacityEvent(admin,owner.id,4,[{ name:"General",capacity:1,count:1 },{ name:"VIP",capacity:2,count:2 }]);
      const assigned=await capacityEvent(admin,owner.id,6,[{ name:"General",capacity:3,count:1 },{ name:"VIP",capacity:3,count:2 }]);
      await signIn(page,owner); await cardFor(page,event.title).getByRole("button",{ name:"Editar",exact:true }).first().click();
      const form=eventForm(page); await form.getByLabel("Aforo total").fill("2");
      await form.getByRole("button",{ name:"Guardar cambios" }).click();
      await expect(page.locator("main").getByRole("alert")).toContainText("aforo del evento"); await expect(page.locator("main").getByRole("alert")).toContainText("mínimo es 3");
      await expect(form.getByLabel("Aforo total")).toHaveValue("2");
      await form.getByLabel("Aforo total").fill("3"); await form.getByRole("button",{ name:"Guardar cambios" }).click();
      await expect(cardFor(page,event.title).getByText("3 / 3 entradas asignadas")).toBeVisible();
      await cardFor(page,assigned.title).getByRole("button",{ name:"Editar",exact:true }).first().click();
      await form.getByLabel("Aforo total").fill("3"); await form.getByRole("button",{ name:"Guardar cambios" }).click();
      await expect(page.locator("main").getByRole("alert")).toContainText("6 cupos asignados");
      await expect(page.locator("main").getByRole("alert")).not.toContainText("mínimo es 6");
      await form.getByLabel("Aforo total").fill("2"); await form.getByRole("button",{ name:"Guardar cambios" }).click();
      await expect(page.locator("main").getByRole("alert")).toContainText("mínimo es 3");
      await expect(page.locator("main").getByRole("alert")).toContainText("6 cupos asignados");
      await expect(page.locator("main").getByRole("alert")).toBeFocused();
      await page.setViewportSize({ width:390,height:844 });
      await page.screenshot({ path:info.outputPath("multiple-capacity-errors-mobile.png"),fullPage:true });
    } finally { await cleanupOrganizer(admin,owner.id); }
  });
});

test.describe("US3 API", () => {
  test("HTTP validates contracts, permissions and complete rollback with multiple figures", async ({ request }) => {
    const admin=adminClient(); const owner=await createAccount(admin,"us3-api"); const other=await createAccount(admin,"us3-other");
    try {
      const event=await capacityEvent(admin,owner.id,8,[{ name:"General",capacity:5,count:2 },{ name:"VIP",capacity:3,count:2 }]);
      const foreign=await capacityEvent(admin,owner.id,2,[{ name:"Other",capacity:2,count:0 }]);
      const token=await accessToken(owner.email,owner.password); const otherToken=await accessToken(other.email,other.password);
      const headers={ Authorization:`Bearer ${token}` }; const url=`/api/eventos/${event.id}/configuracion`;
      const errors=[null,[],{}, { event:{} },{ ticketType:{ id:event.types[0].id } }, { unexpected:1 },
        ...[null,"2",1.5,0,-1,2147483648].map((value) => ({ event:{ maxCapacity:value } })),
        { event:{ eventDate:"2026-02-30T12:00:00Z" } },{ event:{ eventDate:"2026-10-05T12:00" } },
        { event:{ timeZone:"Not/AZone" } },{ event:{ status:"unknown" } },{ event:{ description:{} } },{ event:{ title:" " } }];
      for (const payload of errors) {
        const response=await request.patch(url,{ headers,data:payload }); expect(response.status()).toBe(400); expect(Object.keys(await response.json())).toEqual(["error"]);
      }
      expect((await request.patch(url,{ data:{ event:{ title:"Unauthenticated" } } })).status()).toBe(401);
      const forbidden=await request.patch(url,{ headers:{ Authorization:`Bearer ${otherToken}` },data:{ event:{ maxCapacity:1 } } });
      expect(forbidden.status()).toBe(403); expect((await forbidden.json()).error).not.toContain("mínimo");
      expect((await request.patch(`/api/eventos/${randomUUID()}/configuracion`,{ headers,data:{ event:{ title:"Missing" } } })).status()).toBe(404);
      expect((await request.patch(url,{ headers,data:{ ticketType:{ id:foreign.types[0].id,name:"Wrong event" } } })).status()).toBe(404);
      const rejected=await request.patch(url,{ headers,data:{ event:{ title:"Rollback",maxCapacity:3 },ticketType:{ id:event.types[1].id,maxCapacity:1 } } });
      expect(rejected.status()).toBe(409); const message=(await rejected.json()).error;
      expect(message).toContain("mínimo es 4"); expect(message).toContain("mínimo es 2"); expect(message).toContain("6 cupos asignados");
      expect(message).toContain("VIP");
      const { data: unchanged }=await admin.from("events").select("title,max_capacity").eq("id",event.id).single();
      expect(unchanged).toEqual({ title:event.title,max_capacity:8 });
      const { data:type }=await admin.from("ticket_types").select("max_capacity").eq("id",event.types[1].id).single(); expect(type!.max_capacity).toBe(3);
      const success=await request.patch(url,{ headers,data:{ event:{ maxCapacity:6 },ticketType:{ id:event.types[0].id,maxCapacity:3 } } });
      expect(success.status()).toBe(200); expect(await success.json()).toEqual({ eventId:event.id,ticketTypeId:event.types[0].id });
      const metadata=await request.patch(url,{ headers,data:{ event:{ eventDate:"2026-10-05T12:00:00-04:00",description:null } } });
      expect(metadata.status()).toBe(200); expect((await metadata.json()).ticketTypeId).toBeNull();
      const { data:dated }=await admin.from("events").select("event_date").eq("id",event.id).single(); expect(Date.parse(dated!.event_date)).toBe(Date.parse("2026-10-05T16:00:00Z"));
    } finally { await cleanupOrganizer(admin,owner.id); await cleanupOrganizer(admin,other.id); }
  });

  test("technical error translation and unrecognized DETAIL use owned fallback", () => {
    for (const code of ["55P03","40P01","40001"]) expect(configurationError({ code }).status).toBe(503);
    expect(configurationError({ code:"0A000" }).status).toBe(500);
    expect(configurationError({ code:"unknown" }).status).toBe(500);
    for (const details of ["provider secret",'{}','{"kind":"capacityViolation","version":2,"violations":[]}',JSON.stringify({ kind:"capacityViolation",version:1,violations:[{ scope:"event",reason:"unknown",requestedCapacity:1,minimumCapacity:3 }] })]) {
      expect(decodeCapacityDetails(details)).toBeNull();
      expect(organizerErrorMessage("saveEvent",{ code:"23514",details })).toBe("No pudimos guardar el evento. Revisa los datos e intenta nuevamente.");
    }
    expect(parseEventConfiguration({ event:{ maxCapacity:2,eventDate:"2026-10-05T12:00:00-04:00" } })).toEqual({ event:{ maxCapacity:2,eventDate:"2026-10-05T16:00:00.000Z" } });
  });

  test("retry after contention or new registration keeps inputs and uses current figures", async ({ page }) => {
    const admin=adminClient(); const owner=await createAccount(admin,"us3-retry");
    try {
      const event=await capacityEvent(admin,owner.id,4,[{ name:"VIP",capacity:4,count:2 }]);
      await signIn(page,owner); await cardFor(page,event.title).locator("li").getByRole("button",{ name:"Editar" }).click();
      const form=typeForm(page); await form.getByLabel("Capacidad").fill("1");
      await page.route("**/api/eventos/*/configuracion",(route) => route.fulfill({ status:503,json:{ error:"Otro cambio está en curso. Intenta guardar nuevamente." } }),{ times:1 });
      await form.getByRole("button",{ name:"Guardar cambios" }).click();
      await expect(page.locator("main").getByRole("alert")).toContainText("Otro cambio"); await expect(form.getByLabel("Capacidad")).toHaveValue("1");
      await form.getByRole("button",{ name:"Guardar cambios" }).click(); await expect(page.locator("main").getByRole("alert")).toContainText("mínimo es 2");
      const { data:registration,error }=await admin.from("registrations").insert({ event_id:event.id,ticket_type_id:event.types[0].id,attendee_name:"Later",attendee_email:`later-${randomUUID()}@example.test` }).select("id").single();
      expect(error).toBeNull(); expect((await admin.from("tickets").insert({ registration_id:registration!.id })).error).toBeNull();
      await form.getByRole("button",{ name:"Guardar cambios" }).click(); await expect(page.locator("main").getByRole("alert")).toContainText("mínimo es 3");
      await expect(form.getByLabel("Capacidad")).toHaveValue("1");
    } finally { await cleanupOrganizer(admin,owner.id); }
  });
});
