import { createRequire } from "node:module";
import { resolve } from "node:path";
import { otpEmail } from "../emails/otpEmail";
import { PasswordActionError } from "../utils/passwordSecurity";

type Message = { from: string; to: string; subject: string; html: string; text: string };
type MailTransport = { sendMail(message: Message): Promise<unknown> };
let smtpTransport: MailTransport | undefined;
const unavailable = () => new PasswordActionError(503, "Email verification is temporarily unavailable. Please try again later.", "EMAIL_UNAVAILABLE");

/** Resolve SMTP only when configured, so recovery configuration never breaks normal login. */
export function assertEmailConfigured(): void {
  if (!process.env.OTP_HASH_SECRET || process.env.OTP_HASH_SECRET.length < 32) throw unavailable();
  const provider = process.env.EMAIL_PROVIDER ?? "smtp";
  if (provider === "resend") {
    if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) throw unavailable();
    return;
  }
  if (provider !== "smtp" || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD || !process.env.EMAIL_FROM) throw unavailable();
  if (!smtpTransport) {
    try {
      const require = createRequire(resolve(process.cwd(), "package.json"));
      const nodemailer = require("nodemailer") as { createTransport(options: object): MailTransport };
      const host = process.env.SMTP_HOST || "smtp.gmail.com";
      const port = Number(process.env.SMTP_PORT || 465);
      if (![465, 587].includes(port)) throw new Error("Unsupported SMTP port.");
      smtpTransport = nodemailer.createTransport({
        host, port, secure: port === 465, requireTLS: true,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
        connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
        logger: false, debug: false,
      });
    } catch { throw unavailable(); }
  }
}

export async function sendOtpEmail(to: string, code: string, deliveryId: string): Promise<void> {
  assertEmailConfigured();
  const message = { from: process.env.EMAIL_FROM!, to, ...otpEmail(code) };
  if ((process.env.EMAIL_PROVIDER ?? "smtp") === "smtp") {
    await smtpTransport!.sendMail(message);
    return;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": deliveryId },
    body: JSON.stringify({ ...message, to: [to] }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw unavailable();
}
