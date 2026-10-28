import assert from 'node:assert/strict';
import test from 'node:test';
import { allowRoles } from '../src/middleware/auth.js';

function response() { return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } }; }

test('allowRoles permits an assigned role', () => {
  let called = false;
  allowRoles('admin')({ user: { roles: ['admin'] } }, response(), () => { called = true; });
  assert.equal(called, true);
});

test('allowRoles blocks a missing role', () => {
  const res = response();
  allowRoles('admin')({ user: { roles: ['teacher'] } }, res, () => {});
  assert.equal(res.statusCode, 403);
});
