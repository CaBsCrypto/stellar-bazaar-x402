import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedAdminEmail, createMagicLinkToken } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!email || !isAuthorizedAdminEmail(email)) {
      // Return 200 with generic message to prevent email enumeration
      return NextResponse.json({
        success: true,
        message: "Si tu correo está autorizado, recibirás un enlace de acceso en breve.",
      });
    }

    const resendApiKey = process.env.RESEND_API_KEY?.trim();
    const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL;
    if (!resendApiKey || !configuredOrigin) return NextResponse.json({success:false,error:"ADMIN_DELIVERY_NOT_CONFIGURED"},{status:503});
    const origin = new URL(configuredOrigin);
    if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) return NextResponse.json({success:false,error:"ADMIN_ORIGIN_INVALID"},{status:503});
    const token = await createMagicLinkToken(email);
    const magicLink = origin.origin + "/admin#key=" + token;

    if (resendApiKey) {
      const emailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Stellar Bazaar <auth@browns.studio>",
          to: email,
          subject: "🛡️ Enlace de Acceso de Administrador · Stellar Bazaar",
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; background: #0b0f19; color: #f8fafc; border-radius: 12px; padding: 32px; border: 1px solid rgba(255,255,255,0.1);">
              <h1 style="color: #fff; font-size: 20px; margin-top: 0;">✦ Stellar Bazaar Admin Center</h1>
              <p style="color: #94a3b8; font-size: 15px; line-height: 1.5;">
                Has solicitado un enlace de acceso seguro para el correo <strong>${email}</strong>.
              </p>
              <div style="margin: 28px 0;">
                <a href="${magicLink}" style="background: linear-gradient(135deg, #7057e8 0%, #4338ca 100%); color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block; font-size: 15px;">
                  Desbloquear Panel Admin →
                </a>
              </div>
              <p style="color: #64748b; font-size: 13px; line-height: 1.4;">
                Este enlace es válido por 15 minutos y es de un solo uso. Si no solicitaste este acceso, puedes ignorar este correo.
              </p>
            </div>
          `,
        }),
      });

      if (!emailRes.ok) {
        return NextResponse.json({success:false,error:"ADMIN_DELIVERY_FAILED"},{status:503});
      }
    }

    return NextResponse.json({
      success: true,
      message: "Si tu correo está autorizado, recibirás un enlace de acceso en breve.",
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "ADMIN_LINK_UNAVAILABLE" },
      { status: 500 }
    );
  }
}
