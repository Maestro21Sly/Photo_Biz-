import { env } from "../env.js";

interface Mail {
  to: string;
  subject: string;
  html: string;
}

/** Send an email via the configured driver. Never throws — failures are logged. */
export async function sendEmail({ to, subject, html }: Mail): Promise<void> {
  try {
    if (env.emailDriver === "resend" && env.resendApiKey) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.resendApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: env.emailFrom, to, subject, html }),
      });
      return;
    }
    // console driver (dev): log so the flow is testable without a provider.
    // Muted under test, where every signup would otherwise print an email body.
    if (env.isTest) return;
    console.log(`\n📧 [email:${to}] ${subject}\n${html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()}\n`);
  } catch (err) {
    console.warn("sendEmail failed", err);
  }
}

const shell = (title: string, body: string, cta?: { label: string; href: string }) => `
  <div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#17130F">
    <h2 style="color:#FF5A36;margin:0 0 16px">SnapCampus</h2>
    <h3 style="margin:0 0 8px">${title}</h3>
    <p style="color:#6E665C;line-height:1.5">${body}</p>
    ${cta ? `<p style="margin:24px 0"><a href="${cta.href}" style="background:#FF5A36;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:700">${cta.label}</a></p>` : ""}
    <p style="color:#9A9389;font-size:12px">If you didn't request this, you can ignore this email.</p>
  </div>`;

export function sendPasswordReset(to: string, link: string) {
  return sendEmail({
    to,
    subject: "Reset your SnapCampus password",
    html: shell("Reset your password", "Tap the button below to choose a new password. This link expires in 1 hour.", { label: "Reset password", href: link }),
  });
}

export function sendVerifyEmail(to: string, link: string) {
  return sendEmail({
    to,
    subject: "Verify your SnapCampus email",
    html: shell("Confirm your email", "Welcome to SnapCampus! Confirm your email to finish setting up your account.", { label: "Verify email", href: link }),
  });
}
