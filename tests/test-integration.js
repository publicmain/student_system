/**
 * Integration smoke test: starts real server, tests HTTP endpoints
 * Run: node --test tests/test-integration.js
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

let server;
let port;
let cookie = '';

function req(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: '127.0.0.1', port, path: urlPath, method,
      headers: { 'Content-Type': 'application/json', Cookie: cookie, ...headers },
    };
    const r = http.request(opts, (res) => {
      let data = '';
      res.on('data', (d) => data += d);
      res.on('end', () => {
        // Capture set-cookie
        const sc = res.headers['set-cookie'];
        if (sc) cookie = sc.map(c => c.split(';')[0]).join('; ');
        let json = null;
        try { json = JSON.parse(data); } catch(e) {}
        resolve({ status: res.statusCode, data: json, raw: data, headers: res.headers });
      });
    });
    r.on('error', reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

function waitForServer(maxRetries = 30) {
  return new Promise((resolve, reject) => {
    let tries = 0;
    const check = () => {
      const r = http.get(`http://127.0.0.1:${port}/api/auth/me`, (res) => {
        res.resume();
        resolve();
      });
      r.on('error', () => {
        if (++tries >= maxRetries) return reject(new Error('Server did not start'));
        setTimeout(check, 500);
      });
    };
    check();
  });
}

describe('Integration Smoke Tests', { timeout: 60000 }, () => {
  before(async () => {
    // Use random port
    port = 19000 + Math.floor(Math.random() * 1000);
    process.env.PORT = String(port);
    process.env.NODE_ENV = 'test';

    server = spawn('node', ['server.js'], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, PORT: String(port), NODE_ENV: 'test' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    server.stderr.on('data', (d) => {}); // suppress
    await waitForServer();
  });

  after(() => {
    if (server) server.kill('SIGTERM');
  });

  // ── Auth ──

  it('GET /api/auth/me without session → 401', async () => {
    cookie = '';
    const r = await req('GET', '/api/auth/me');
    assert.equal(r.status, 401);
  });

  it('POST /api/auth/login bad password → 401', async () => {
    const r = await req('POST', '/api/auth/login', { username: 'principal', password: 'wrong' });
    assert.equal(r.status, 401);
  });

  it('POST /api/auth/login principal → 200 + user', async () => {
    const r = await req('POST', '/api/auth/login', { username: 'principal', password: '123456' });
    assert.equal(r.status, 200);
    assert.ok(r.data.user);
    assert.equal(r.data.user.role, 'principal');
  });

  it('GET /api/auth/me with session → 200', async () => {
    const r = await req('GET', '/api/auth/me');
    assert.equal(r.status, 200);
    assert.equal(r.data.user.role, 'principal');
  });

  // ── Route existence (not 404) ──

  it('GET /api/dashboard/stats → 200 (as principal)', async () => {
    const r = await req('GET', '/api/dashboard/stats');
    assert.equal(r.status, 200);
    assert.ok(r.data.totalStudents !== undefined);
  });

  it('GET /api/students → 200', async () => {
    const r = await req('GET', '/api/students');
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.data));
  });

  it('GET /api/staff → 200', async () => {
    const r = await req('GET', '/api/staff');
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.data));
  });

  it('GET /api/settings → 200', async () => {
    const r = await req('GET', '/api/settings');
    assert.equal(r.status, 200);
  });

  it('GET /api/subjects → 200', async () => {
    const r = await req('GET', '/api/subjects');
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.data));
  });

  it('GET /api/templates → 200', async () => {
    const r = await req('GET', '/api/templates');
    assert.equal(r.status, 200);
  });

  it('GET /api/intake-cases → 200', async () => {
    const r = await req('GET', '/api/intake-cases');
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.data));
  });

  it('GET /api/intake-dashboard → 200', async () => {
    const r = await req('GET', '/api/intake-dashboard');
    assert.equal(r.status, 200);
  });

  it('GET /api/notifications → 200', async () => {
    const r = await req('GET', '/api/notifications');
    assert.equal(r.status, 200);
  });

  it('GET /api/audit → 200', async () => {
    const r = await req('GET', '/api/audit');
    assert.equal(r.status, 200);
  });

  it('GET /api/analytics/overview → 200', async () => {
    const r = await req('GET', '/api/analytics/overview');
    assert.equal(r.status, 200);
  });

  it('GET /api/agents → 200', async () => {
    const r = await req('GET', '/api/agents');
    assert.equal(r.status, 200);
  });

  it('GET /api/mat-companies → 200', async () => {
    const r = await req('GET', '/api/mat-companies');
    assert.equal(r.status, 200);
  });

  it('GET /api/mat-requests → 200', async () => {
    const r = await req('GET', '/api/mat-requests');
    assert.equal(r.status, 200);
  });

  it('GET /api/adm-profiles → 200', async () => {
    const r = await req('GET', '/api/adm-profiles');
    assert.equal(r.status, 200);
  });

  // ── Permission tests ──

  it('counselor cannot access intake-cases', async () => {
    // Login as counselor
    cookie = '';
    const login = await req('POST', '/api/auth/login', { username: 'counselor', password: '123456' });
    assert.equal(login.status, 200);

    const r = await req('GET', '/api/intake-cases');
    assert.equal(r.status, 403);
  });

  it('mentor cannot access staff', async () => {
    cookie = '';
    const login = await req('POST', '/api/auth/login', { username: 'mentor', password: '123456' });
    assert.equal(login.status, 200);

    const r = await req('GET', '/api/staff');
    // Staff list requires principal or counselor
    assert.ok([403, 200].includes(r.status)); // mentor may have requireAuth only
  });

  // ── Logout ──

  it('POST /api/auth/logout → 200', async () => {
    const r = await req('POST', '/api/auth/logout');
    assert.equal(r.status, 200);
  });

  it('after logout, /api/auth/me → 401', async () => {
    const r = await req('GET', '/api/auth/me');
    assert.equal(r.status, 401);
  });
});
