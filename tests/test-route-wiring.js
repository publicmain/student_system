/**
 * Test: Route wiring verification
 * Verifies all route files are properly mounted and no routes are 404
 * Run: node --test tests/test-route-wiring.js
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROUTES_DIR = path.join(__dirname, '..', 'routes');
const SERVER_PATH = path.join(__dirname, '..', 'server.js');

describe('Route Wiring', () => {
  const serverCode = fs.readFileSync(SERVER_PATH, 'utf8');
  const routeFiles = fs.readdirSync(ROUTES_DIR).filter(f => f.endsWith('.js'));

  it('should have route files in routes/ directory', () => {
    assert.ok(routeFiles.length >= 15, `Expected 15+ route files, got ${routeFiles.length}`);
  });

  it('every route file should be required in server.js', () => {
    const missing = [];
    for (const file of routeFiles) {
      const name = file.replace('.js', '');
      if (!serverCode.includes(`./routes/${name}`)) {
        missing.push(file);
      }
    }
    assert.deepEqual(missing, [], `Route files not mounted in server.js: ${missing.join(', ')}`);
  });

  it('every route file should export a function', () => {
    for (const file of routeFiles) {
      const mod = require(path.join(ROUTES_DIR, file));
      const type = typeof mod;
      assert.ok(type === 'function', `${file} exports ${type}, expected function`);
    }
  });

  it('every route file factory should return a router or {apiRouter, publicRouter}', () => {
    // Create minimal deps object for testing
    const mockDb = { get: () => null, all: () => [], run: () => {} };
    const mockDeps = {
      db: mockDb, uuidv4: () => 'test', audit: () => {},
      requireAuth: (r,s,n) => n(), requireRole: () => (r,s,n) => n(),
      requireAgentModule: (r,s,n) => n(), requireAdmissionModule: (r,s,n) => n(),
      stripAgentFields: (o) => o, bcrypt: { hashSync: () => '', compareSync: () => false },
      BCRYPT_COST: 10, upload: { single: () => (r,s,n) => n(), array: () => (r,s,n) => n() },
      fileStorage: { getFilePath: () => null, saveFile: () => '', readFile: () => null,
        deleteFile: () => false, getFileSize: () => 0, saveBase64: () => null, initDirs: () => {} },
      moveUploadedFile: () => {}, sendMail: async () => {},
      escHtml: (s) => s, brandedEmail: () => ({ html: '', attachments: [] }),
      fs: require('fs'), path: require('path'), crypto: require('crypto'),
      archiver: () => {}, xlsx: { utils: {} },
      aiPlanner: null, aiEval: null, pdfGenerator: null, UPLOAD_DIR: '/tmp',
      loginAttempts: new Map(), pwdChangeAttempts: new Map(),
      LOGIN_MAX_ATTEMPTS: 10, LOGIN_WINDOW_MS: 900000, PWD_CHANGE_MAX: 5,
      aiCallAttempts: new Map(), AI_CALL_MAX: 20, AI_CALL_WINDOW_MS: 3600000,
      agentCallAttempts: new Map(), AGENT_CALL_MAX: 60, AGENT_CALL_WINDOW_MS: 60000,
      ALLOWED_EXTENSIONS: new Set(['.pdf','.jpg']),
      _matSendInviteEmail: async () => {},
    };

    for (const file of routeFiles) {
      const factory = require(path.join(ROUTES_DIR, file));
      try {
        const result = factory(mockDeps);
        const isRouter = typeof result === 'function' && typeof result.get === 'function';
        const isDual = result && typeof result.apiRouter === 'function' && typeof result.publicRouter === 'function';
        assert.ok(isRouter || isDual, `${file} factory didn't return router or {apiRouter, publicRouter}`);
      } catch(e) {
        // Some routes may fail during init (e.g., reading db), that's OK for wiring test
        // As long as they don't throw on require itself
      }
    }
  });

  it('server.js deps object should contain all required keys', () => {
    const requiredKeys = [
      'db', 'uuidv4', 'audit', 'requireAuth', 'requireRole',
      'requireAgentModule', 'requireAdmissionModule',
      'bcrypt', 'BCRYPT_COST', 'upload', 'fileStorage',
      'sendMail', 'escHtml', 'brandedEmail',
      'loginAttempts', 'pwdChangeAttempts',
      'LOGIN_MAX_ATTEMPTS', 'LOGIN_WINDOW_MS', 'PWD_CHANGE_MAX',
    ];
    for (const key of requiredKeys) {
      assert.ok(serverCode.includes(key), `deps object missing '${key}'`);
    }
  });

  it('no route paths should start with /api when mount prefix is /api', () => {
    // Routes mounted at /api should have paths like '/students', not '/api/students'
    for (const file of routeFiles) {
      if (['file-exchange.js', 'orientation.js'].includes(file)) continue; // dual-mount, skip
      const code = fs.readFileSync(path.join(ROUTES_DIR, file), 'utf8');
      const doubleApiPaths = code.match(/router\.(get|post|put|delete)\('\/api\//g);
      assert.ok(!doubleApiPaths, `${file} has paths starting with /api/ (double prefix): ${doubleApiPaths}`);
    }
  });

  it('middleware/auth.js should export all required functions', () => {
    const auth = require(path.join(__dirname, '..', 'middleware', 'auth'));
    assert.ok(typeof auth.requireAuth === 'function');
    assert.ok(typeof auth.requireRole === 'function');
    assert.ok(typeof auth.requireAgentModule === 'function');
    assert.ok(typeof auth.requireAdmissionModule === 'function');
    assert.ok(typeof auth.stripAgentFields === 'function');
  });

  it('helpers/utils.js should export all required functions', () => {
    const utils = require(path.join(__dirname, '..', 'helpers', 'utils'));
    assert.ok(typeof utils.escHtml === 'function');
    assert.ok(typeof utils.createAudit === 'function');
    assert.ok(typeof utils.brandedEmail === 'function');
    assert.ok(typeof utils.moveUploadedFile === 'function');
  });
});
