import { NextResponse } from "next/server";

type SignoffEmailPayload = {
  pilotName: string;
  monthKey: string;
  signedName: string;
  signedAt: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<SignoffEmailPayload>;

    const pilotName = body.pilotName?.trim() || "";
    const monthKey = body.monthKey?.trim() || "";
    const signedName = body.signedName?.trim() || "";
    const signedAt = body.signedAt?.trim() || "";

    if (!pilotName || !monthKey || !signedName || !signedAt) {
      return NextResponse.json(
        { error: "Missing required signoff email fields." },
        { status: 400 }
      );
    }

    const resendApiKey = process.env.RESEND_API_KEY || "";
    const fromEmail = process.env.RESEND_FROM_EMAIL || "";
    const notifyTo = process.env.SIGNOFF_NOTIFICATION_TO || "";

    if (!resendApiKey) {
      return NextResponse.json(
        { error: "Missing RESEND_API_KEY." },
        { status: 500 }
      );
    }

    if (!fromEmail) {
      return NextResponse.json(
        { error: "Missing RESEND_FROM_EMAIL." },
        { status: 500 }
      );
    }

    if (!notifyTo) {
      return NextResponse.json(
        { error: "Missing SIGNOFF_NOTIFICATION_TO." },
        { status: 500 }
      );
    }

    const signedDate = new Date(signedAt);
    const signedAtText = Number.isNaN(signedDate.getTime())
      ? signedAt
      : signedDate.toLocaleString();

    const subject = `Flight & Duty Log signed: ${pilotName} ${monthKey}`;

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.5;">
        <h2>Month Signed</h2>
        <p><strong>Pilot:</strong> ${escapeHtml(pilotName)}</p>
        <p><strong>Month:</strong> ${escapeHtml(monthKey)}</p>
        <p><strong>Signed By:</strong> ${escapeHtml(signedName)}</p>
        <p><strong>Signed At:</strong> ${escapeHtml(signedAtText)}</p>
      </div>
    `;

    const text =
      `Month Signed\n\n` +
      `Pilot: ${pilotName}\n` +
      `Month: ${monthKey}\n` +
      `Signed By: ${signedName}\n` +
      `Signed At: ${signedAtText}\n`;

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: notifyTo.split(",").map((s) => s.trim()).filter(Boolean),
        subject,
        html,
        text,
      }),
    });

    const resendJson = await resendResponse.json();

    if (!resendResponse.ok) {
      return NextResponse.json(
        {
          error: resendJson?.message || "Failed to send signoff email.",
          details: resendJson,
        },
        { status: resendResponse.status }
      );
    }

    return NextResponse.json({ ok: true, resend: resendJson });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Unexpected email route error." },
      { status: 500 }
    );
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
