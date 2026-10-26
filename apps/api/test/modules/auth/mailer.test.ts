import { describe, expect, it } from "vitest";
import { createMailer } from "../../../src/modules/auth/mailer.js";
import { captureLog } from "../../helpers/ctx.js";
import { testConfig } from "../../helpers/env.js";

const SMTP = "smtp://mailuser:mail-SECRET@smtp.example.test:587";
const mail = {
  to: "a@example.test",
  subject: "Verify your email",
  text: "Open https://api.example.test/api/auth/verify-email?token=TOKEN-123",
};
function setup(over: Parameters<typeof testConfig>[0]) {
  const { log, lines } = captureLog();
  const sent: unknown[] = [];
  const urls: string[] = [];
  const createTransport = (url: string) => {
    urls.push(url);
    return {
      sendMail: async (m: unknown) => {
        sent.push(m);
      },
    };
  };
  return {
    mailer: createMailer({ config: testConfig(over), log, createTransport }),
    lines,
    sent,
    urls,
  };
}

describe("createMailer", () => {
  it("sends through the SMTP_URL transport with MAIL_FROM, and logs neither the SMTP URL nor the link", async () => {
    const t = setup({ smtpUrl: SMTP, mailFrom: "Lumen <hi@example.test>", devRoutes: true });
    await t.mailer(mail);
    expect(t.urls).toEqual([SMTP]);
    expect(t.sent).toEqual([
      {
        from: "Lumen <hi@example.test>",
        to: "a@example.test",
        subject: "Verify your email",
        text: mail.text,
      },
    ]);
    expect(t.lines.join("")).not.toMatch(/mail-SECRET|smtp\.example|TOKEN-123/);
  });

  it("with no SMTP_URL in development, prints the mail (with the link) in the log and sends nothing", async () => {
    const t = setup({ smtpUrl: "", devRoutes: true });
    await t.mailer(mail);
    expect(t.urls).toEqual([]);
    expect(t.lines.join("")).toContain("TOKEN-123");
  });

  it("with no SMTP_URL outside development, never writes the link to the log", async () => {
    const t = setup({ smtpUrl: "", devRoutes: false });
    await t.mailer(mail);
    expect(t.lines.join("")).not.toContain("TOKEN-123");
    expect(t.lines.join("")).toMatch(/not sent/i);
  });

  it("a failing SMTP server surfaces an error that carries neither the URL nor the mail text", async () => {
    const mailer = createMailer({
      config: testConfig({ smtpUrl: SMTP }),
      log: captureLog().log,
      createTransport: () => ({
        sendMail: async () => {
          throw Object.assign(new Error(`connect failed ${SMTP}`), { code: "ECONNECTION" });
        },
      }),
    });
    const err = await mailer(mail).catch((e: Error) => e);
    expect(String((err as Error).message)).not.toMatch(/mail-SECRET|smtp\.example/);
  });
});
