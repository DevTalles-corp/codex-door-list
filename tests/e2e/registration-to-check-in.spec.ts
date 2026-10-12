import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import QRCode from "qrcode";
import { accessToken, cleanupOrganizer } from "./constitutional-fixtures";
import { coverFixture, generateCoverFixtures } from "./event-cover-fixtures";

type CapturedEmail = {
  to: string[];
  subject: string;
  html: string;
  text: string;
  attachments: { filename: string; content: string | { type: "Buffer"; data: number[] }; content_id?: string }[];
};

function localEventDate() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/La_Paz",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}T23:59`;
}

test.beforeAll(generateCoverFixtures);

for (const coverState of ["absent", "delayed", "failed"] as const) test(`publish, register, receive a ticket, and check in — cover ${coverState}`, async ({ page, request }) => {
  const supabase = createClient(
    process.env.E2E_SUPABASE_URL!,
    process.env.E2E_SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const id = randomUUID();
  const organizerEmail = `organizer-${id}@example.com`;
  const attendeeEmail = `attendee-${id}@example.com`;
  const password = `DoorList-${id}`;
  const eventTitle = `Evento E2E ${id}`;
  const attendeeName = "Asistente de prueba";

  const { data: organizer, error: createError } = await supabase.auth.admin.createUser({
    email: organizerEmail,
    password,
    email_confirm: true,
  });
  expect(createError).toBeNull();
  expect(organizer.user).toBeTruthy();

  try {
    const organizerResponse = await page.goto("/organizador", { waitUntil: "domcontentloaded" });
    expect(organizerResponse?.ok(), `/organizador returned HTTP ${organizerResponse?.status() ?? "no response"}`).toBe(true);
    await page.getByLabel("Email").fill(organizerEmail);
    await page.getByLabel("Contraseña").fill(password);
    await page.getByRole("button", { name: "Ingresar" }).click();
    await expect(page.getByRole("heading", { name: "Nuevo evento" })).toBeVisible();

    const eventForm = page.locator("form").first();
    await eventForm.getByLabel("Nombre").fill(eventTitle);
    await eventForm.getByLabel("Fecha y hora").fill(localEventDate());
    await eventForm.getByLabel("Lugar").fill("Sala de pruebas");
    await eventForm.getByLabel("Aforo total").fill("5");
    await eventForm.getByRole("button", { name: "Crear evento" }).click();

    const eventCard = page.locator("article").filter({ hasText: eventTitle });
    await expect(eventCard.getByText("Borrador")).toBeVisible();

    const ticketTypeForm = page.locator("form").filter({ has: page.getByRole("heading", { name: "Nuevo tipo de entrada" }) });
    await ticketTypeForm.getByLabel("Evento").selectOption({ label: eventTitle });
    await ticketTypeForm.getByLabel("Nombre").fill("General");
    await ticketTypeForm.getByLabel("Capacidad").fill("5");
    await ticketTypeForm.getByRole("button", { name: "Agregar entrada" }).click();
    await expect(eventCard.getByText("General")).toBeVisible();

    await eventCard.getByRole("button", { name: "Editar" }).first().click();
    await eventForm.getByLabel("Estado").selectOption("published");
    await eventForm.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(eventCard.getByText("Publicado")).toBeVisible();

    const registrationLink = eventCard.getByRole("link", { name: "Abrir registro" });
    await expect(registrationLink).toBeVisible();
    const registrationUrl = await registrationLink.getAttribute("href");
    expect(registrationUrl).toMatch(/^\/eventos\/[0-9a-f]{64}\/registro$/);
    const publicCode = registrationUrl!.split("/")[2];
    const { data: eventRow } = await supabase.from("events").select("id").eq("public_code", publicCode).single();
    const eventId = eventRow!.id;

    let releaseCover: (() => void) | undefined;
    if (coverState !== "absent") {
      const token = await accessToken(organizerEmail, password);
      const headers = { Authorization: `Bearer ${token}` };
      const bytes = await coverFixture("minimum.png");
      const base = `/api/eventos/${eventId}/portada`;
      const preparation = await request.post(`${base}/subidas`, { headers, data: { expectedRevision: "0", byteSize: bytes.length } });
      expect(preparation.status()).toBe(201);
      const prepared = await preparation.json();
      expect((await supabase.storage.from(prepared.upload.bucket).uploadToSignedUrl(prepared.upload.path, prepared.upload.token, bytes, { contentType: "application/octet-stream" })).error).toBeNull();
      expect((await request.post(`${base}/confirmar`, { headers, data: { operationId: prepared.operationId, expectedRevision: "0" } })).status()).toBe(200);
      if (coverState === "failed") {
        await page.route("**/_next/image?*", (route) => route.abort());
        await page.route("**/storage/v1/object/public/event-covers/**", (route) => route.abort());
      } else {
        const released = new Promise<void>((resolve) => { releaseCover = resolve; });
        await page.route("**/_next/image?*", async (route) => { await released; await route.continue(); });
      }
    }
    await page.goto(registrationUrl!, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: eventTitle })).toBeVisible();
    await page.getByRole("radio", { name: /General/ }).check();
    await page.getByLabel("Nombre completo").fill(attendeeName);
    await page.getByLabel("Email").fill(attendeeEmail);
    await page.getByRole("button", { name: "Enviar enlace de confirmación" }).click();
    await expect(page.getByRole("heading", { name: "Revisa tu email" })).toBeVisible();
    releaseCover?.();
    await expect(page.getByRole("status")).toContainText(attendeeEmail);

    await expect.poll(async () => {
      const response = await request.get(`http://127.0.0.1:3101/messages?to=${encodeURIComponent(attendeeEmail)}`);
      expect(response.ok()).toBeTruthy();
      return (await response.json() as CapturedEmail[]).length;
    }).toBe(1);
    const messagesResponse = await request.get(`http://127.0.0.1:3101/messages?to=${encodeURIComponent(attendeeEmail)}`);
    const [confirmationEmail] = await messagesResponse.json() as CapturedEmail[];
    const confirmationUrl = confirmationEmail.text.match(/https?:\/\/[^\s]+\/eventos\/confirmar\?token=[0-9a-f]{64}/);
    expect(confirmationUrl).not.toBeNull();
    const { count } = await supabase.from("registrations").select("id", { count: "exact", head: true }).eq("event_id", eventId);
    expect(count).toBe(0);
    await page.goto(confirmationUrl![0]);
    await page.getByRole("button", { name: "Confirmar reserva" }).click();
    await expect(page.getByRole("link", { name: "Ver mi entrada" })).toBeVisible();
    await expect.poll(async () => {
      const response = await request.get(`http://127.0.0.1:3101/messages?to=${encodeURIComponent(attendeeEmail)}`);
      return (await response.json() as CapturedEmail[]).length;
    }).toBe(2);
    const ticketMessages = await request.get(`http://127.0.0.1:3101/messages?to=${encodeURIComponent(attendeeEmail)}`);
    const [, email] = await ticketMessages.json() as CapturedEmail[];
    expect(email.to).toContain(attendeeEmail);
    expect(email.subject).toContain(eventTitle);
    expect(email.text).toContain(attendeeName);
    const qrAttachment = email.attachments.find((attachment) => attachment.filename === "entrada-qr.png");
    expect(qrAttachment).toBeTruthy();
    const qrBytes = typeof qrAttachment!.content === "string"
      ? Buffer.from(qrAttachment!.content, "base64")
      : Buffer.from(qrAttachment!.content.data);
    expect(qrBytes.subarray(0, 8).toString("hex"))
      .toBe("89504e470d0a1a0a");
    expect(email.html).toContain("cid:ticket-qr-");
    const ticketUrl = email.text.match(/https?:\/\/[^\s]+\/entradas\/([0-9a-f]{64})/);
    expect(ticketUrl).not.toBeNull();
    const ticketCode = ticketUrl![1];

    await page.goto(ticketUrl![0]);
    await expect(page.getByRole("heading", { name: eventTitle })).toBeVisible();
    await expect(page.getByText(attendeeName, { exact: true })).toHaveCount(0);
    await expect(page.getByText(attendeeEmail, { exact: true })).toHaveCount(0);
    await expect(page.locator(".ticket-status")).toContainText("Válida");

    await page.goto(`/scan?eventId=${eventId}`);
    await expect(page.getByRole("heading", { name: "Control de acceso" })).toBeVisible();
    await expect(page.getByLabel("Evento")).toHaveValue(eventId);
    const qrImage = await QRCode.toDataURL(ticketCode, { width: 320, margin: 2, errorCorrectionLevel: "H" });
    await page.evaluate(async (imageUrl) => {
      const image = new Image();
      image.src = imageUrl;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 480;
      const context = canvas.getContext("2d")!;
      const drawFrame = () => {
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 160, 80, 320, 320);
      };
      drawFrame();
      window.setInterval(drawFrame, 100);
      Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
        configurable: true,
        value: async () => canvas.captureStream(15),
      });
    }, qrImage);

    await page.getByRole("button", { name: "Abrir cámara" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Entrada válida" })).toContainText(attendeeName);

    await page.getByRole("button", { name: "Escanear otra entrada" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Entrada usada" })).toBeVisible();

    await page.goto(ticketUrl![0]);
    await expect(page.locator(".ticket-status")).toContainText("Utilizada");
  } finally {
    if (organizer.user) {
      await cleanupOrganizer(supabase, organizer.user.id);
    }
  }
});
