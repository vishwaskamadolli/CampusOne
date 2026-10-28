import crypto from "node:crypto";
import { config } from "../config.js";

export function generateTemporaryPassword() {
  return `${crypto.randomBytes(18).toString("base64url")}Aa1!`;
}

async function sendEmail({ to, subject, text }, fetchImpl) {
  if (!config.resendApiKey || !config.emailFrom || !to) return null;
  const response = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.resendApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: config.emailFrom, to: [to], subject, text }),
  });
  if (!response.ok) throw new Error(`Email provider rejected delivery (${response.status})`);
  return "email";
}

async function sendSms({ to, text }, fetchImpl) {
  if (!config.twilioAccountSid || !config.twilioAuthToken || !config.twilioFrom || !to) return null;
  const body = new URLSearchParams({ To: to, From: config.twilioFrom, Body: text });
  const response = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${config.twilioAccountSid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${config.twilioAccountSid}:${config.twilioAuthToken}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) throw new Error(`SMS provider rejected delivery (${response.status})`);
  return "sms";
}

export async function deliverCredentialMessage({ email, phone, subject, text }, fetchImpl = fetch) {
  const attempted = [];
  if (email) attempted.push(() => sendEmail({ to: email, subject, text }, fetchImpl));
  if (phone) attempted.push(() => sendSms({ to: phone, text }, fetchImpl));
  for (const attempt of attempted) {
    try {
      const channel = await attempt();
      if (channel) return { status: "delivered", channel };
    } catch {
      // Provider details and credential-bearing payloads are deliberately not logged.
    }
  }
  return { status: "failed", channel: null };
}

export async function deliverTeacherInvitation({ name, email, phone, temporaryPassword }, fetchImpl) {
  return deliverCredentialMessage({
    email, phone,
    subject: "Your CampusOne teacher account",
    text: `Hello ${name}, your CampusOne account is ready. Sign in with ${email} and temporary password: ${temporaryPassword}. You must change it immediately after signing in.`,
  }, fetchImpl);
}

export async function deliverParentInvitation({ name, email, phone, temporaryPassword }, fetchImpl) {
  return deliverCredentialMessage({
    email, phone,
    subject: "Your CampusOne parent account",
    text: `Hello ${name}, your CampusOne parent account is ready. Sign in with ${email} and temporary password: ${temporaryPassword}. You must change it immediately after signing in.`,
  }, fetchImpl);
}

export async function deliverPasswordReset({ name, email, phone, token }, fetchImpl) {
  const link = `${config.webUrl.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(token)}`;
  return deliverCredentialMessage({
    email, phone,
    subject: "Reset your CampusOne password",
    text: `Hello ${name}, use this time-limited link to reset your CampusOne password: ${link}. If you did not request this, ignore this message.`,
  }, fetchImpl);
}
