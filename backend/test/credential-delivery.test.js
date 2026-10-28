import assert from "node:assert/strict";
import test from "node:test";
import { config } from "../src/config.js";
import { deliverParentInvitation, deliverPasswordReset, deliverTeacherInvitation, generateTemporaryPassword } from "../src/services/credential-delivery.js";
import { teacherCreationResponse } from "../src/routes/people.routes.js";
import { requireAuth } from "../src/middleware/auth.js";
import jwt from "jsonwebtoken";

function response() {
  return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

test("teacher creation response never exposes a temporary password", () => {
  const result = teacherCreationResponse({ _id: "teacher-1", userId: { email: "teacher@example.edu" } }, { status: "delivered", channel: "email" });
  assert.equal(JSON.stringify(result).includes("password"), false);
  assert.deepEqual(result.notification, { status: "delivered", channel: "email" });
});

test("temporary teacher passwords are generated with strong random structure", () => {
  const first = generateTemporaryPassword();
  const second = generateTemporaryPassword();
  assert.notEqual(first, second);
  assert.ok(first.length >= 24);
  assert.match(first, /[A-Z]/);
  assert.match(first, /[a-z]/);
  assert.match(first, /\d/);
  assert.match(first, /!/);
});

test("teacher invitation is delivered without returning its credential", async () => {
  const previous = { key: config.resendApiKey, from: config.emailFrom };
  config.resendApiKey = "test-key"; config.emailFrom = "no-reply@example.edu";
  let payload;
  const result = await deliverTeacherInvitation({ name: "A Teacher", email: "teacher@example.edu", temporaryPassword: "Secret-Aa1!" }, async (_url, options) => { payload = JSON.parse(options.body); return { ok: true, status: 200 }; });
  config.resendApiKey = previous.key; config.emailFrom = previous.from;
  assert.equal(result.status, "delivered");
  assert.equal(result.channel, "email");
  assert.match(payload.text, /Secret-Aa1!/);
  assert.equal(Object.hasOwn(result, "temporaryPassword"), false);
});

test("parent invitation includes first-login password change instructions", async () => {
  const previous = { key: config.resendApiKey, from: config.emailFrom };
  config.resendApiKey = "test-key"; config.emailFrom = "no-reply@example.edu";
  let payload;
  const result = await deliverParentInvitation({ name: "A Parent", email: "parent@example.edu", temporaryPassword: "Secret-Aa1!" }, async (_url, options) => { payload = JSON.parse(options.body); return { ok: true, status: 200 }; });
  config.resendApiKey = previous.key; config.emailFrom = previous.from;
  assert.equal(result.status, "delivered");
  assert.match(payload.subject, /parent account/i);
  assert.match(payload.text, /must change it immediately/i);
  assert.equal(Object.hasOwn(result, "temporaryPassword"), false);
});

test("password recovery sends a time-limited reset link without returning the token", async () => {
  const previous = { key: config.resendApiKey, from: config.emailFrom, web: config.webUrl };
  config.resendApiKey = "test-key"; config.emailFrom = "no-reply@example.edu"; config.webUrl = "https://college.example";
  let payload;
  const result = await deliverPasswordReset({ name: "A Teacher", email: "teacher@example.edu", token: "reset-secret" }, async (_url, options) => { payload = JSON.parse(options.body); return { ok: true, status: 200 }; });
  Object.assign(config, { resendApiKey: previous.key, emailFrom: previous.from, webUrl: previous.web });
  assert.match(payload.text, /https:\/\/college\.example\/reset-password\?token=reset-secret/);
  assert.equal(JSON.stringify(result).includes("reset-secret"), false);
});

test("first-login sessions can only access password-change endpoints", () => {
  const token = jwt.sign({ id: "user-1", tenantId: "tenant-1", roles: ["teacher"], mustChangePassword: true }, config.sessionSecret);
  const blocked = response();
  requireAuth({ cookies: { campus_session: token }, originalUrl: "/api/v1/attendance/today" }, blocked, () => {});
  assert.equal(blocked.statusCode, 403);
  let allowed = false;
  requireAuth({ cookies: { campus_session: token }, originalUrl: "/api/v1/auth/change-password" }, response(), () => { allowed = true; });
  assert.equal(allowed, true);
});
