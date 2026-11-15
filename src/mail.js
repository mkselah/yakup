// Phase 2: sends mail through Gmail SMTP with an app password.
import nodemailer from "nodemailer";
import { pathToFileURL } from "node:url";
// Load .env (Node 20.12+). Needed here because `npm run testmail` runs this file directly.
try {
  process.loadEnvFile();
} catch {}
let transporter = null;
function getConfig() {
  const user = (process.env.MAIL_USER || "").trim();
  const pass = (process.env.MAIL_APP_PASSWORD || "").replace(/\s+/g, "");
  const to = (process.env.MAIL_TO || user).trim();
  if (!user || !pass) {
    throw new Error("Missing MAIL_USER or MAIL_APP_PASSWORD in .env");
  }
  return { user, pass, to };
}
function getTransporter() {
  if (transporter) return transporter;
  const { user, pass } = getConfig();
  transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
    connectionTimeout: 20000,
    greetingTimeout: 20000,
    socketTimeout: 30000,
  });
  return transporter;
}
function htmlToText(html) {
  return String(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h\d|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
export async function sendMail(subject, html) {
  const { user, to } = getConfig();
  const info = await getTransporter().sendMail({
    from: `"Price watcher" <${user}>`,
    to,
    subject,
    html,
    text: htmlToText(html),
  });
  console.log(`Mail sent to ${to}: ${subject}`);
  return info;
}
// `node src/mail.js --test` (npm run testmail)
const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain && process.argv.includes("--test")) {
  try {
    const now = new Date().toLocaleString("da-DK", { timeZone: "Europe/Copenhagen" });
    await sendMail(
      "Price watcher: test mail",
      `<h3>It works!</h3><p>Test mail sent at ${now}.</p>`
    );
  } catch (err) {
    console.error("Test mail FAILED:", err.message);
    if (err.code === "EAUTH") {
      console.error("Gmail rejected the login. Check that MAIL_USER is the full address,");
      console.error("MAIL_APP_PASSWORD is an App Password (not your normal password),");
      console.error("and that 2-step verification is on.");
    }
    process.exit(1);
  }
}