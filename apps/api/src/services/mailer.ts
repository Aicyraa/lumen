import nodemailer from "nodemailer";
import type { Logger } from "pino";
import type { Config } from "../config/config.js";

export interface Mail { to: string; subject: string; text: string; html?: string }
export type Mailer = (mail: Mail) => Promise<void>;
type Transport = { sendMail(mail: object): Promise<unknown> };

// SMTP over SMTP_URL (nodemailer). Rule 4: the URL carries the password, so it and the mail text are never logged on success or failure.
// With no SMTP_URL, development prints the mail (so the verification link can be followed); anything else sends nothing and logs no link.
export function createMailer({ config, log, createTransport = (url) => nodemailer.createTransport(url) }: {
  config: Pick<Config, "smtpUrl" | "mailFrom" | "devRoutes">; log: Logger; createTransport?: (url: string) => Transport;
}): Mailer {
  if (!config.smtpUrl) {
    return async (mail) => {
      if (config.devRoutes) log.info({ to: mail.to, subject: mail.subject, text: mail.text }, "mail not sent (no SMTP_URL, development): open the link below");
      else log.warn({ subject: mail.subject }, "mail not sent: SMTP_URL is not set");
    };
  }
  const transport = createTransport(config.smtpUrl);
  return async (mail) => {
    try {
      await transport.sendMail({ from: config.mailFrom, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html });
    } catch (err) {
      log.error({ code: (err as { code?: string }).code }, "mail delivery failed");
      throw new Error("mail delivery failed"); // nodemailer errors can quote the connection string
    }
  };
}
