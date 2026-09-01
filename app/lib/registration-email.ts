import QRCode from "qrcode";
import { Resend } from "resend";

type RegistrationTicket = {
  code: string;
  attendee: {
    name: string;
    email: string;
  };
  event: {
    title: string;
    event_date: string;
    venue: string;
  };
  ticket_type: {
    name: string;
  };
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatEventDate(value: string) {
  return new Intl.DateTimeFormat("es-BO", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "America/La_Paz",
  }).format(new Date(value));
}

export async function sendRegistrationEmail({
  registrationId,
  ticket,
  ticketUrl,
}: {
  registrationId: string;
  ticket: RegistrationTicket;
  ticketUrl: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !from) {
    throw new Error("Missing Resend configuration");
  }

  const eventDate = formatEventDate(ticket.event.event_date);
  const contentId = `ticket-qr-${registrationId}`;
  const qrPng = await QRCode.toBuffer(ticket.code, {
    type: "png",
    width: 420,
    margin: 3,
    errorCorrectionLevel: "H",
    color: {
      dark: "#171717",
      light: "#ffffff",
    },
  });

  const name = escapeHtml(ticket.attendee.name);
  const eventTitle = escapeHtml(ticket.event.title);
  const venue = escapeHtml(ticket.event.venue);
  const ticketType = escapeHtml(ticket.ticket_type.name);
  const safeEventDate = escapeHtml(eventDate);
  const safeTicketUrl = escapeHtml(ticketUrl);

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send(
    {
      from,
      to: [ticket.attendee.email],
      subject: `Tu entrada para ${ticket.event.title}`,
      html: `
        <!doctype html>
        <html lang="es">
          <body style="margin:0;background:#f4f1eb;color:#171717;font-family:Arial,sans-serif;">
            <div style="display:none;max-height:0;overflow:hidden;">Tu entrada para ${eventTitle} está lista.</div>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f1eb;padding:32px 16px;">
              <tr>
                <td align="center">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #ddd6cc;border-radius:20px;overflow:hidden;">
                    <tr>
                      <td style="padding:36px 36px 16px;text-align:center;">
                        <p style="margin:0 0 10px;color:#71675b;font-size:12px;font-weight:bold;letter-spacing:1.6px;text-transform:uppercase;">Door List · Entrada digital</p>
                        <h1 style="margin:0;font-size:28px;line-height:1.2;">${eventTitle}</h1>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:12px 36px 4px;">
                        <p style="margin:0 0 20px;font-size:16px;line-height:1.5;">Hola ${name}, tu registro está confirmado.</p>
                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:15px;line-height:1.45;">
                          <tr><td style="padding:7px 0;color:#71675b;vertical-align:top;">Fecha</td><td style="padding:7px 0 7px 18px;font-weight:bold;">${safeEventDate}</td></tr>
                          <tr><td style="padding:7px 0;color:#71675b;vertical-align:top;">Lugar</td><td style="padding:7px 0 7px 18px;font-weight:bold;">${venue}</td></tr>
                          <tr><td style="padding:7px 0;color:#71675b;vertical-align:top;">Entrada</td><td style="padding:7px 0 7px 18px;font-weight:bold;">${ticketType}</td></tr>
                        </table>
                      </td>
                    </tr>
                    <tr>
                      <td align="center" style="padding:28px 36px 12px;">
                        <img src="cid:${contentId}" width="260" height="260" alt="Código QR de tu entrada" style="display:block;width:260px;height:260px;border:0;" />
                        <p style="margin:14px 0 0;color:#71675b;font-size:13px;line-height:1.45;">Presenta este QR al ingresar.</p>
                      </td>
                    </tr>
                    <tr>
                      <td align="center" style="padding:18px 36px 36px;">
                        <a href="${safeTicketUrl}" style="display:inline-block;background:#171717;color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold;padding:12px 18px;border-radius:999px;">Ver entrada digital</a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
        </html>
      `,
      text: [
        `Hola ${ticket.attendee.name}, tu registro está confirmado.`,
        "",
        ticket.event.title,
        `Fecha: ${eventDate}`,
        `Lugar: ${ticket.event.venue}`,
        `Entrada: ${ticket.ticket_type.name}`,
        "",
        `Entrada digital: ${ticketUrl}`,
      ].join("\n"),
      attachments: [
        {
          content: qrPng,
          filename: "entrada-qr.png",
          contentId,
        },
      ],
    },
    {
      idempotencyKey: `registration-ticket/${registrationId}`,
    },
  );

  if (error) {
    throw new Error(`Resend rejected the email: ${error.message}`);
  }
}
