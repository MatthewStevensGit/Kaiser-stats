import nodemailer from "nodemailer";

/**
 * Reuses the same Gmail account + App Password already generated for
 * Supabase Auth's custom SMTP (see kaiser_stats_sendgrid_trial memory note) —
 * one Gmail account covers both auth emails (configured directly in the
 * Supabase dashboard, not through this file) and these app-triggered
 * reminder/lineup emails (sent from here). Same accepted deliverability
 * tradeoff either way: a personal Gmail address can't be domain-authenticated,
 * so mail can land in spam — acceptable at this app's current small,
 * trusted-recipient scale.
 */
function getTransport() {
  const user = process.env.GMAIL_SMTP_USER;
  const pass = process.env.GMAIL_SMTP_APP_PASSWORD;
  if (!user || !pass) {
    throw new Error("GMAIL_SMTP_USER / GMAIL_SMTP_APP_PASSWORD are not set.");
  }
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: { user, pass },
  });
}

export async function sendMailViaGmail(params: { to: string[]; subject: string; body: string }): Promise<void> {
  const transport = getTransport();
  const from = process.env.GMAIL_SMTP_USER;
  // Sent one message per recipient in `to` (via `bcc`) rather than a single
  // multi-recipient `to` header — keeps every player's email address private
  // from the rest of the league, same privacy posture as known_emails never
  // being shown anywhere in the UI.
  await transport.sendMail({
    from,
    to: from,
    bcc: params.to,
    subject: params.subject,
    text: params.body,
  });
}
