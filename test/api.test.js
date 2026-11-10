import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createApp } from '../server/app.js';
import { closeDatabase, openDatabase } from '../server/db.js';

function makeClient(baseUrl) {
  let cookie = '';
  return {
    getCookie: () => cookie,
    async request(url, options = {}) {
      const headers = { ...(options.headers || {}) };
      if (cookie) headers.cookie = cookie;
      if (options.body && typeof options.body !== 'string') {
        headers['content-type'] = 'application/json';
        options.body = JSON.stringify(options.body);
      }
      const response = await fetch(`${baseUrl}${url}`, { ...options, headers });
      const setCookies = response.headers.getSetCookie?.() || [];
      if (setCookies.length) {
        cookie = setCookies.map((value) => value.split(';')[0]).join('; ');
      }
      const type = response.headers.get('content-type') || '';
      const body = type.includes('application/json')
        ? await response.json()
        : Buffer.from(await response.arrayBuffer());
      return { response, body, type };
    },
  };
}

test('Uren API: setup, logging, leave, sharing and exports', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uren-api-test-'));
  const db = openDatabase(path.join(tempDir, 'uren.db'));
  const app = createApp(db);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  t.after(async () => {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
    closeDatabase(db);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const owner = makeClient(baseUrl);

  const boot = await owner.request('/api/bootstrap');
  assert.equal(boot.response.status, 200);
  assert.equal(boot.body.needsSetup, true);
  assert.equal(boot.body.user, null);

  const setup = await owner.request('/api/setup', {
    method: 'POST',
    body: {
      displayName: 'Test Owner',
      company: 'MAGVIEW',
      username: 'owner',
      password: 'ownerpass123',
    },
  });
  assert.equal(setup.response.status, 201);
  assert.equal(setup.body.user.role, 'admin');
  assert.equal(setup.body.workspace.profileName, 'Test Owner');
  assert.ok(setup.response.headers.get('set-cookie').includes('HttpOnly'));

  const day1 = await owner.request('/api/day/2025-09-01', {
    method: 'PUT',
    body: {
      kind: 'work',
      note: '',
      entries: [{ description: 'Fix alarms', hours: 8 }],
    },
  });
  assert.equal(day1.response.status, 200);
  assert.equal(day1.body.month.days['2025-09-01'].total, 8);

  const day2 = await owner.request('/api/day/2025-09-02', {
    method: 'PUT',
    body: { kind: 'holiday', note: 'Public holiday', entries: [] },
  });
  assert.equal(day2.response.status, 200);
  assert.equal(day2.body.month.summary.leaveDays, 1);

  const day3 = await owner.request('/api/day/2025-09-03', {
    method: 'PUT',
    body: {
      kind: 'work',
      note: 'Two tickets',
      entries: [
        { description: 'Daily meeting', hours: 0.5 },
        { description: 'Code review', hours: 2 },
      ],
    },
  });
  assert.equal(day3.response.status, 200);
  assert.equal(day3.body.month.days['2025-09-03'].total, 2.5);

  const invalid = await owner.request('/api/day/2025-09-04', {
    method: 'PUT',
    body: {
      kind: 'work',
      note: '',
      entries: [{ description: 'Too much', hours: 25 }],
    },
  });
  assert.equal(invalid.response.status, 400);

  const month = await owner.request('/api/month?year=2025&month=9');
  assert.equal(month.response.status, 200);
  const summary = month.body.summary;
  assert.equal(summary.loggedHours, 10.5);
  assert.equal(summary.workdayCount, 22);
  assert.equal(summary.leaveDays, 1);
  assert.equal(summary.expectedWorkdays, 21);
  assert.equal(summary.targetHours, 168);
  assert.equal(summary.balanceToDate, -157.5);
  assert.equal(summary.missingDays, 19);
  assert.equal(month.body.weeks.length, 5);

  const year = await owner.request('/api/year?year=2025');
  assert.equal(year.response.status, 200);
  assert.equal(year.body.totals.expectedWorkdays >= 21, true);
  assert.equal(year.body.months.length, 12);

  const xlsx = await owner.request('/api/export/month.xlsx?year=2025&month=9');
  assert.equal(xlsx.type, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.equal(xlsx.body.subarray(0, 2).toString(), 'PK');

  const pdf = await owner.request('/api/export/month.pdf?year=2025&month=9');
  assert.equal(pdf.type, 'application/pdf');
  assert.equal(pdf.body.subarray(0, 4).toString(), '%PDF');
  assert.ok(pdf.body.length > 3000);

  const share = await owner.request('/api/share', { method: 'POST' });
  assert.equal(share.response.status, 200);
  const token = share.body.shareToken;
  assert.ok(token.length > 20);

  const publicClient = makeClient(baseUrl);
  const publicBoot = await publicClient.request(`/api/public/${token}/bootstrap`);
  assert.equal(publicBoot.response.status, 200);
  assert.equal(publicBoot.body.readOnly, true);
  const publicMonth = await publicClient.request(`/api/public/${token}/month?year=2025&month=9`);
  assert.equal(publicMonth.body.summary.loggedHours, 10.5);

  const viewer = await owner.request('/api/users', {
    method: 'POST',
    body: {
      displayName: 'Manager',
      username: 'manager',
      password: 'managerpass123',
      role: 'viewer',
    },
  });
  assert.equal(viewer.response.status, 201);
  assert.equal(viewer.body.users.length, 2);

  const manager = makeClient(baseUrl);
  const login = await manager.request('/api/auth/login', {
    method: 'POST',
    body: { username: 'manager', password: 'managerpass123' },
  });
  assert.equal(login.response.status, 200);
  assert.equal(login.body.user.role, 'viewer');

  const forbidden = await manager.request('/api/day/2025-09-04', {
    method: 'PUT',
    body: { kind: 'work', note: '', entries: [{ description: 'No', hours: 1 }] },
  });
  assert.equal(forbidden.response.status, 403);
  const read = await manager.request('/api/month?year=2025&month=9');
  assert.equal(read.response.status, 200);

  const badLogin = await makeClient(baseUrl).request('/api/auth/login', {
    method: 'POST',
    body: { username: 'manager', password: 'wrong-password' },
  });
  assert.equal(badLogin.response.status, 401);

  const backup = await owner.request('/api/export/backup.json');
  assert.equal(backup.response.status, 200);
  assert.equal(backup.body.days.length, 3);

  const changed = await owner.request('/api/auth/password', {
    method: 'POST',
    body: { currentPassword: 'ownerpass123', newPassword: 'ownerpass456' },
  });
  assert.equal(changed.response.status, 200);
});
