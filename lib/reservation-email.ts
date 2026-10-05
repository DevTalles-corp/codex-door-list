import { Resend } from "resend";

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

export async function sendReservationEmail(input: {
  reservationId: string;
  email: string;
  eventTitle: string;
  confirmUrl: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) throw new Error("Missing email configuration");
  const resend = new Resend(apiKey);
  const safeTitle = escapeHtml(input.eventTitle);
  const safeUrl = escapeHtml(input.confirmUrl);
  const { error } = await resend.emails.send({
    from, to: [input.email], subject: `Confirma tu reserva para ${input.eventTitle}`,
    html: `<p>Confirma tu reserva para ${safeTitle} en los próximos 10 minutos.</p><p><a href="${safeUrl}">Confirmar reserva</a></p>`,
    text: `Confirma tu reserva para ${input.eventTitle} en los próximos 10 minutos:\n${input.confirmUrl}`,
  }, { idempotencyKey: `reservation-confirmation/${input.reservationId}` });
  if (error) {
    const senderDomain = from.match(/@([^>\s]+)/)?.[1]?.toLowerCase();
    console.error("[reservation-email] Provider rejected confirmation email", {
      code: error.name,
      statusCode: error.statusCode,
      senderDomain,
      ...(senderDomain === "resend.dev" && error.statusCode === 403
        ? { action: "Verify a sending domain in Resend and update RESEND_FROM_EMAIL; resend.dev only supports the account email." }
        : {}),
    });
    throw new Error("Reservation email delivery failed");
  }
}
