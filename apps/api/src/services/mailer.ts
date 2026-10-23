import type { Logger } from "pino";
import type { Config } from "../config/config.js";

export interface Mail { to: string; subject: string; text: string; html?: string }
export type Mailer = (mail: Mail) => Promise<void>;
type Transport = { sendMail(mail: object): Promise<unknown> };

// Placeholder until the next commit: sends nothing.
export function createMailer(_deps: { config: Pick<Config, "smtpUrl" | "mailFrom" | "devRoutes">; log: Logger; createTransport?: (url: string) => Transport }): Mailer {
  return async () => {};
}
